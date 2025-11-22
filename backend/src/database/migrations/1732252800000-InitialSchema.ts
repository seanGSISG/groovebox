import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial database schema migration for GrooveBox
 *
 * This migration creates all the core tables for the GrooveBox application:
 * - users: User accounts
 * - rooms: Chat rooms for synchronized audio playback
 * - room_members: User memberships in rooms
 * - votes: DJ elections and mutiny votes
 * - room_dj_history: Historical record of DJ assignments
 *
 * The schema is designed to support:
 * - Multi-user synchronized audio playback
 * - Democratic DJ selection through voting
 * - Room-based chat and audio synchronization
 * - Clock sync metrics for audio alignment
 */
export class InitialSchema1732252800000 implements MigrationInterface {
  name = 'InitialSchema1732252800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension if not already enabled
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "username" VARCHAR(50) NOT NULL UNIQUE,
        "display_name" VARCHAR(100) NOT NULL,
        "password_hash" VARCHAR(255),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "last_seen" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_username" ON "users" ("username")
    `);

    // Create rooms table
    await queryRunner.query(`
      CREATE TABLE "rooms" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "room_code" VARCHAR(10) NOT NULL UNIQUE,
        "room_name" VARCHAR(100) NOT NULL,
        "password_hash" VARCHAR(255),
        "owner_id" UUID,
        "settings" JSONB DEFAULT '{
          "maxMembers": 50,
          "mutinyThreshold": 0.51,
          "djCooldownMinutes": 5,
          "autoRandomizeDJ": false
        }',
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "is_active" BOOLEAN DEFAULT true,
        CONSTRAINT "fk_room_owner" FOREIGN KEY ("owner_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_room_code" ON "rooms" ("room_code")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_active_rooms" ON "rooms" ("is_active", "created_at")
    `);

    // Create room_members table
    await queryRunner.query(`
      CREATE TABLE "room_members" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "room_id" UUID NOT NULL,
        "user_id" UUID NOT NULL,
        "role" VARCHAR(20) DEFAULT 'listener',
        "joined_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "last_active" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "last_clock_offset_ms" INTEGER,
        "average_rtt_ms" INTEGER,
        CONSTRAINT "fk_member_room" FOREIGN KEY ("room_id")
          REFERENCES "rooms"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_member_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_room_user" UNIQUE ("room_id", "user_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_room_members" ON "room_members" ("room_id", "last_active")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_user_rooms" ON "room_members" ("user_id", "joined_at")
    `);

    // Create room_dj_history table
    await queryRunner.query(`
      CREATE TABLE "room_dj_history" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "room_id" UUID NOT NULL,
        "user_id" UUID NOT NULL,
        "became_dj_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "removed_at" TIMESTAMP WITH TIME ZONE,
        "removal_reason" VARCHAR(50),
        CONSTRAINT "fk_dj_history_room" FOREIGN KEY ("room_id")
          REFERENCES "rooms"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_dj_history_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_room_current_dj" ON "room_dj_history" ("room_id", "removed_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_dj_history" ON "room_dj_history" ("room_id", "became_dj_at" DESC)
    `);

    // Create votes table
    await queryRunner.query(`
      CREATE TABLE "votes" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "room_id" UUID NOT NULL,
        "voter_id" UUID NOT NULL,
        "vote_type" VARCHAR(20) NOT NULL,
        "target_user_id" UUID,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "vote_session_id" UUID,
        "is_active" BOOLEAN DEFAULT true,
        CONSTRAINT "fk_vote_room" FOREIGN KEY ("room_id")
          REFERENCES "rooms"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_vote_voter" FOREIGN KEY ("voter_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_vote_target" FOREIGN KEY ("target_user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_vote_session" UNIQUE ("room_id", "voter_id", "vote_session_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_active_votes" ON "votes" ("room_id", "vote_session_id", "is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order (respecting foreign key constraints)
    await queryRunner.query(`DROP TABLE IF EXISTS "votes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "room_dj_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "room_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rooms"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
