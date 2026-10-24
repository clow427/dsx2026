import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Event Spark 2.0'

interface Props {
  attendeeName?: string
  eventName?: string
  eventDateLine?: string
  locationLine?: string
  organizerName?: string
  intro?: string
  signature?: string
  calendarUrl?: string
  eventUrl?: string
}

const RegistrationConfirmation = ({
  attendeeName, eventName, eventDateLine, locationLine, organizerName, intro, signature, calendarUrl, eventUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're registered for {eventName || 'the event'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You're in{attendeeName ? `, ${attendeeName}` : ''}!</Heading>
        <Text style={text}>
          {intro || `Thanks for registering for ${eventName || 'this event'}. We're excited to have you join us.`}
        </Text>

        <Section style={card}>
          {eventName && <Text style={cardTitle}>{eventName}</Text>}
          {eventDateLine && <Text style={cardLine}>📅 {eventDateLine}</Text>}
          {locationLine && <Text style={cardLine}>📍 {locationLine}</Text>}
        </Section>

        {calendarUrl && (
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button href={calendarUrl} style={button}>Add to calendar</Button>
          </Section>
        )}

        {eventUrl && (
          <Text style={text}>
            View event details: <a href={eventUrl} style={link}>{eventUrl}</a>
          </Text>
        )}

        <Hr style={hr} />
        <Text style={footer}>
          {signature || `— ${organizerName || SITE_NAME}`}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RegistrationConfirmation,
  subject: (d: Record<string, any>) => `You're registered for ${d?.eventName || 'the event'}`,
  displayName: 'Registration confirmation',
  previewData: {
    attendeeName: 'Jamie',
    eventName: 'Founders Brunch · Spring 2026',
    eventDateLine: 'Sat, Apr 18, 2026 · 10:00 AM EST',
    locationLine: 'The Hoxton, Williamsburg',
    organizerName: 'eventspark',
    calendarUrl: 'https://example.com/calendar.ics',
    eventUrl: 'https://example.com/register/event',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '26px', fontWeight: 700, color: '#1a1530', margin: '0 0 16px', letterSpacing: '-0.02em' }
const text = { fontSize: '15px', color: '#3d3a4f', lineHeight: '1.6', margin: '0 0 18px' }
const card = { backgroundColor: '#fafafa', borderRadius: '14px', padding: '20px', margin: '20px 0' }
const cardTitle = { fontSize: '17px', fontWeight: 600, color: '#1a1530', margin: '0 0 10px' }
const cardLine = { fontSize: '14px', color: '#55546b', margin: '4px 0' }
const button = { backgroundColor: '#1a1530', color: '#ffffff', padding: '12px 24px', borderRadius: '999px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }
const link = { color: '#d83b78', textDecoration: 'none' }
const hr = { borderColor: '#eeeef2', margin: '28px 0 18px' }
const footer = { fontSize: '13px', color: '#8a8896', margin: 0 }
