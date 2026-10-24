// Public dispatcher for transactional emails. Accepts only an event kind +
// authoritative ID; rebuilds the recipient and template data server-side from
// the database so callers cannot inject phishing content or change recipients.
//
// Then invokes `send-transactional-email` server-to-server with the service
// role key.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

function formatEventDateTime(event: any): string {
  if (!event?.event_date) return ''
  try {
    const d = new Date(event.event_date)
    return d.toLocaleString('en-US', {
      timeZone: event.timezone || 'America/New_York',
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })
  } catch {
    return ''
  }
}

function buildEventUrl(slug: string): string {
  const base = (Deno.env.get('PUBLIC_APP_URL') || '').replace(/\/$/, '')
  if (base) return `${base}/register/${slug}`
  return `/register/${slug}`
}

function buildAcceptUrl(token: string): string {
  const base = (Deno.env.get('PUBLIC_APP_URL') || '').replace(/\/$/, '')
  if (base) return `${base}/cohost/accept?token=${token}`
  return `/cohost/accept?token=${token}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: any
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const kind = String(body?.kind || '')
  const admin = createClient(supabaseUrl, serviceKey)

  let templateName: string
  let recipientEmail: string
  let templateData: Record<string, any> = {}
  let idempotencyKey: string

  if (kind === 'registration') {
    const registrationId = String(body?.registration_id || '')
    if (!registrationId) {
      return new Response(JSON.stringify({ error: 'registration_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: reg, error: regErr } = await admin
      .from('registrations')
      .select('id, status, data, event_id, created_at')
      .eq('id', registrationId)
      .maybeSingle()
    if (regErr || !reg) {
      return new Response(JSON.stringify({ error: 'Registration not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Only send the confirmation right after registration to limit replay abuse
    const ageMs = Date.now() - new Date(reg.created_at as string).getTime()
    if (ageMs > 10 * 60 * 1000) {
      return new Response(JSON.stringify({ error: 'Registration too old to notify' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: event, error: evErr } = await admin
      .from('events')
      .select('id, name, slug, event_date, timezone, location_type, location_value, email_signature, email_intro, status')
      .eq('id', reg.event_id as string)
      .maybeSingle()
    if (evErr || !event || event.status !== 'live') {
      return new Response(JSON.stringify({ error: 'Event not available' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const d = (reg.data as any) || {}
    const email = String(d['Email Address'] || d.email || d.Email || '').trim().toLowerCase()
    if (!email) {
      return new Response(JSON.stringify({ error: 'No email on registration' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const attendeeName = String(d['Full Name'] || d.name || d['First Name'] || '').trim()
    const locationLine = (event.location_type === 'physical' || event.location_type === 'hybrid')
      ? (event.location_value || '')
      : 'Virtual event'
    const calendarUrl = `${supabaseUrl}/functions/v1/event-ics?event_id=${event.id}`

    templateName = reg.status === 'waitlisted' ? 'waitlist-confirmation' : 'registration-confirmation'
    recipientEmail = email
    idempotencyKey = `${templateName}-${reg.id}`
    templateData = {
      attendeeName: attendeeName || undefined,
      eventName: event.name,
      eventDateLine: formatEventDateTime(event),
      locationLine,
      calendarUrl,
      eventUrl: buildEventUrl(event.slug as string),
      organizerName: (event as any).email_signature || undefined,
      intro: (event as any).email_intro || undefined,
    }
  } else if (kind === 'cohost_invitation') {
    // This kind requires an authenticated inviter. Use Supabase's signing-keys
    // aware verifier (getClaims) instead of decoding the JWT payload, so we
    // reject forged or unsigned tokens.
    const authHeader = req.headers.get('Authorization') || ''
    const userToken = authHeader.replace(/^Bearer\s+/i, '')
    if (!userToken) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    })
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(userToken)
    const claims = claimsData?.claims
    const callerId = claims?.sub
    if (claimsErr || !callerId || claims?.role === 'service_role' || claims?.role !== 'authenticated') {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const invitationId = String(body?.invitation_id || '')
    if (!invitationId) {
      return new Response(JSON.stringify({ error: 'invitation_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: inv, error: invErr } = await admin
      .from('cohost_invitations')
      .select('id, inviter_id, email, scope, event_id, token, status')
      .eq('id', invitationId)
      .maybeSingle()
    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: 'Invitation not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (inv.inviter_id !== callerId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (inv.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Invitation not pending' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let inviterName = ''
    let inviterCompany = ''
    const { data: prof } = await admin
      .from('profiles')
      .select('full_name, company')
      .eq('id', inv.inviter_id as string)
      .maybeSingle()
    if (prof) {
      inviterName = (prof.full_name as string) || ''
      inviterCompany = (prof.company as string) || ''
    }

    let eventName = ''
    if (inv.scope === 'event' && inv.event_id) {
      const { data: ev } = await admin
        .from('events').select('name').eq('id', inv.event_id as string).maybeSingle()
      eventName = (ev?.name as string) || ''
    }

    templateName = 'cohost-invitation'
    recipientEmail = String(inv.email)
    idempotencyKey = `cohost-invite-${inv.id}`
    templateData = {
      inviterName,
      inviterCompany,
      scopeLabel: inv.scope,
      eventName,
      acceptUrl: buildAcceptUrl(inv.token as string),
    }
  } else {
    return new Response(JSON.stringify({ error: 'Unknown kind' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Invoke send-transactional-email with service role
  const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ templateName, recipientEmail, idempotencyKey, templateData }),
  })

  const out = await res.text()
  return new Response(out, {
    status: res.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
