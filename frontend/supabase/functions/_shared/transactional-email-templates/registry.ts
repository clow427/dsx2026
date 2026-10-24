/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as registrationConfirmation } from './registration-confirmation.tsx'
import { template as waitlistConfirmation } from './waitlist-confirmation.tsx'
import { template as waitlistPromoted } from './waitlist-promoted.tsx'
import { template as eventReminder } from './event-reminder.tsx'
import { template as cohostInvitation } from './cohost-invitation.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'registration-confirmation': registrationConfirmation,
  'waitlist-confirmation': waitlistConfirmation,
  'waitlist-promoted': waitlistPromoted,
  'event-reminder': eventReminder,
  'cohost-invitation': cohostInvitation,
}
