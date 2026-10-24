import { createClient } from 'npm:@supabase/supabase-js@2'

// Returns an .ics file for an event so attendees can add it to their calendar.
// Public endpoint — only exposes minimally needed event details for live events.

function pad(n: number) { return n < 10 ? `0${n}` : `${n}` }
function toIcsDate(d: Date) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}
function escapeIcs(s: string) {
  return (s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const eventId = url.searchParams.get('event_id')
  if (!eventId) return new Response('Missing event_id', { status: 400 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: event, error } = await supabase
    .from('events')
    .select('id, name, description, event_date, event_end_date, location_type, location_value, status')
    .eq('id', eventId)
    .maybeSingle()

  if (error || !event || event.status !== 'live') {
    return new Response('Event not available', { status: 404 })
  }

  if (!event.event_date) return new Response('Event has no date', { status: 400 })

  const start = new Date(event.event_date)
  const end = event.event_end_date ? new Date(event.event_end_date) : new Date(start.getTime() + 60 * 60 * 1000)
  const now = new Date()

  const location = event.location_type === 'physical' || event.location_type === 'hybrid'
    ? (event.location_value || '')
    : (event.location_value || 'Virtual event')

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//eventspark//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@eventspark`,
    `DTSTAMP:${toIcsDate(now)}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcs(event.name)}`,
    event.description ? `DESCRIPTION:${escapeIcs(event.description)}` : '',
    `LOCATION:${escapeIcs(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')

  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="event-${event.id}.ics"`,
      'Cache-Control': 'public, max-age=300',
    },
  })
})
