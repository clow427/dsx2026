import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'eventspark'

interface Props {
  inviterName?: string
  inviterCompany?: string
  scopeLabel?: string
  eventName?: string
  acceptUrl?: string
}

const CohostInvitation = ({ inviterName, inviterCompany, scopeLabel, eventName, acceptUrl }: Props) => {
  const who = inviterName || inviterCompany || `Someone on ${SITE_NAME}`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{who} invited you to co-host on {SITE_NAME}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>You're invited to co-host</Heading>
          <Text style={text}>
            <strong>{who}</strong> invited you to collaborate as a co-host
            {eventName ? ` on "${eventName}"` : scopeLabel === 'account' ? ' across all of their events' : ''}.
            You'll be able to fully edit event details, manage attendees, and update branding.
          </Text>

          {acceptUrl && (
            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button href={acceptUrl} style={button}>Accept invitation</Button>
            </Section>
          )}

          {acceptUrl && (
            <Text style={muted}>
              Or paste this link in your browser:<br />
              <a href={acceptUrl} style={link}>{acceptUrl}</a>
            </Text>
          )}

          <Hr style={hr} />
          <Text style={muted}>This invitation expires in 14 days. If you weren't expecting it, you can safely ignore this email.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: CohostInvitation,
  subject: (d: Record<string, any>) => `${d?.inviterName || d?.inviterCompany || 'Someone'} invited you to co-host on ${SITE_NAME}`,
  displayName: 'Co-host invitation',
  previewData: { inviterName: 'Jane Doe', scopeLabel: 'event', eventName: 'Summer Launch Party', acceptUrl: 'https://example.com/cohost/accept?token=abc' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 24px', maxWidth: '560px' }
const h1 = { fontSize: '24px', fontWeight: 700, color: '#0a0a0a', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#3f3f46', lineHeight: '1.6', margin: '0 0 16px' }
const muted = { fontSize: '13px', color: '#71717a', lineHeight: '1.5', margin: '12px 0' }
const button = { backgroundColor: '#0a0a0a', color: '#ffffff', padding: '12px 28px', borderRadius: '999px', fontSize: '15px', fontWeight: 600, textDecoration: 'none' }
const link = { color: '#dc2654', wordBreak: 'break-all' as const }
const hr = { border: 'none', borderTop: '1px solid #e4e4e7', margin: '28px 0' }
