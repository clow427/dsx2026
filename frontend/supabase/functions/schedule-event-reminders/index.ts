import { createClient } from 'npm:@supabase/supabase-js@2'

// Cron-driven dispatcher that sends reminder emails (24h and 1h before events).
// Idempotent via deterministic idempotencyKey per (registration, window).

const WINDOWS = [
  { key: '24h', minutesBefore: 24 * 60, toleranceMin: 30, phrase: 'Tomorrow', flag: 'send_reminder_24h' as const },
  { key: '1h', minutesBefore: 60, toleranceMin: 15, phrase: 'Starting soon', flag: 'send_reminder_1h' as const },
]

function fmtDate(iso: string, tz: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  const tzAbbr = d.toLocaleTimeString('en-US', { timeZone: tz, timeZoneName: 'short' }).split(' ').pop() || tz
  return `${date} · ${time} ${tzAbbr}`
}

function emailFromData(data: Record<string, any> | null) {
  if (!data) return null
  return (data['Email Address'] || data.email || data.Email || '').toString().trim().toLowerCase() || null
}
function nameFromData(data: Record<string, any> | null) {
  if (!data) return null
  return (data['Full Name'] || data.name || data.Name || '').toString().trim() || null
}

Deno.serve(async (req) => {
  // Restrict invocation to the service role (cron / trusted backend only).
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!token || token !== serviceKey) {
    // Also accept JWTs whose role claim is service_role (defense in depth).
    try {
      const payload = token ? JSON.parse(atob(token.split('.')[1])) : null
      if (!payload || payload.role !== 'service_role') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { 'Content-Type': 'application/json' },
        })
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(supabaseUrl, serviceKey)


  const now = Date.now()
  let totalQueued = 0

  for (const w of WINDOWS) {
    const targetMs = now + w.minutesBefore * 60 * 1000
    const lower = new Date(targetMs - w.toleranceMin * 60 * 1000).toISOString()
    const upper = new Date(targetMs + w.toleranceMin * 60 * 1000).toISOString()

    // Live events with the right reminder enabled in this window
    const { data: events, error: evErr } = await supabase
      .from('events')
      .select('id, name, event_date, event_end_date, timezone, location_type, location_value, send_reminder_24h, send_reminder_1h, email_signature')
      .eq('status', 'live')
      .gte('event_date', lower)
      .lte('event_date', upper)

    if (evErr) { console.error('events query failed', evErr); continue }

    for (const ev of events || []) {
      if (!ev[w.flag]) continue

      const { data: regs } = await supabase
        .from('registrations')
        .select('id, data, status')
        .eq('event_id', ev.id)
        .in('status', ['registered', 'attended', 'checked_in'])

      for (const r of regs || []) {
        const email = emailFromData(r.data as any)
        if (!email) continue

        const idempotencyKey = `event-reminder-${w.key}-${r.id}`

        // Skip if already logged for this idempotency key
        const { data: existing } = await supabase
          .from('email_send_log')
          .select('id')
          .eq('message_id', idempotencyKey)
          .limit(1)
        if (existing && existing.length > 0) continue

        const tz = ev.timezone || 'America/New_York'
        const eventDateLine = ev.event_date ? fmtDate(ev.event_date, tz) : ''
        const locationLine = ev.location_type === 'physical' || ev.location_type === 'hybrid'
          ? (ev.location_value || '')
          : 'Virtual event'

        const calendarUrl = `${supabaseUrl}/functions/v1/event-ics?event_id=${ev.id}`

        const { error: invokeErr } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'event-reminder',
            recipientEmail: email,
            idempotencyKey,
            templateData: {
              attendeeName: nameFromData(r.data as any),
              eventName: ev.name,
              eventDateLine,
              locationLine,
              whenPhrase: w.phrase,
              calendarUrl,
              organizerName: ev.email_signature || undefined,
            },
          },
        })
        if (invokeErr) console.error('send failed', invokeErr); else totalQueued++
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, queued: totalQueued }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
