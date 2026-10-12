/** Drizzle definitions of migrations/1001_api_init.sql (test/schema.test.ts checks both agree). */
import {
  bigint,
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const id = (name: string) => bigint(name, { mode: 'number' });

export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  authProvider: text('auth_provider').notNull(),
  providerUserId: text('provider_user_id').notNull(),
  wallet: text('wallet'),
  displayName: text('display_name'),
  linkedX: text('linked_x'),
  riskScore: integer('risk_score').notNull().default(0),
  flagged: boolean('flagged').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: id('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const crews = pgTable('crews', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  tag: text('tag').notNull(),
  captainUserId: id('captain_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const crewMembers = pgTable('crew_members', {
  userId: id('user_id').primaryKey(),
  crewId: id('crew_id').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
});

export const surveyFinds = pgTable(
  'survey_finds',
  {
    userId: id('user_id').notNull(),
    day: integer('day').notNull(),
    itemId: text('item_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const notificationPrefs = pgTable('notification_prefs', {
  userId: id('user_id').primaryKey(),
  email: text('email'),
  telegramChatId: text('telegram_chat_id'),
  events: jsonb('events').$type<string[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  startsAt: bigint('starts_at', { mode: 'number' }).notNull(),
  endsAt: bigint('ends_at', { mode: 'number' }).notNull(),
});

export const ROLES = ['admin', 'economist', 'support', 'moderator'] as const;
export type Role = (typeof ROLES)[number];

export const adminRoles = pgTable(
  'admin_roles',
  {
    userId: id('user_id').notNull(),
    role: text('role').$type<Role>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actorUserId: id('actor_user_id').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  reason: text('reason').notNull(),
});

export const apiTables = [
  users,
  sessions,
  crews,
  crewMembers,
  surveyFinds,
  notificationPrefs,
  seasons,
  adminRoles,
  auditLog,
] as const;
