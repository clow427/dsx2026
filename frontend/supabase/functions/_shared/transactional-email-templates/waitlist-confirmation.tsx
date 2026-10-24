import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  attendeeName?: string
  eventName?: string
  organizerName?: string
}

const WaitlistConfirmation = ({ attendeeName, eventName, organizerName }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're on the waitlist for {eventName || 'the event'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You're on the waitlist{attendeeName ? `, ${attendeeName}` : ''}</Heading>
        <Text style={text}>
          {eventName || 'This event'} is currently at capacity. We've added you to the waitlist —
          if a spot opens up, we'll email you right away with the details.
        </Text>
        <Section style={card}>
          <Text style={cardLine}>No action needed from you for now. Sit tight!</Text>
        </Section>
        <Hr style={hr} />
        <Text style={footer}>— {organizerName || 'The team'}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WaitlistConfirmation,
  subject: (d: Record<string, any>) => `Waitlisted for ${d?.eventName || 'the event'}`,
  displayName: 'Waitlist confirmation',
  previewData: { attendeeName: 'Jamie', eventName: 'Founders Brunch', organizerName: 'eventspark' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const h1 = { fontSize: '24px', fontWeight: 700, color: '#1a1530', margin: '0 0 16px', letterSpacing: '-0.02em' }
const text = { fontSize: '15px', color: '#3d3a4f', lineHeight: '1.6', margin: '0 0 18px' }
const card = { backgroundColor: '#fafafa', borderRadius: '14px', padding: '18px', margin: '20px 0' }
const cardLine = { fontSize: '14px', color: '#55546b', margin: 0 }
const hr = { borderColor: '#eeeef2', margin: '28px 0 18px' }
const footer = { fontSize: '13px', color: '#8a8896', margin: 0 }
