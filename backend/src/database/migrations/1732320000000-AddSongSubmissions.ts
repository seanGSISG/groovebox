import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class AddSongSubmissions1732320000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'song_submissions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'room_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'submitted_by',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'youtube_url',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'song_title',
            type: 'varchar',
            length: '200',
            isNullable: true,
          },
          {
            name: 'artist',
            type: 'varchar',
            length: '200',
            isNullable: true,
          },
          {
            name: 'vote_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'played_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'song_submissions',
      new TableIndex({
        name: 'IDX_song_submissions_room_active',
        columnNames: ['room_id', 'is_active'],
      }),
    );

    await queryRunner.createForeignKey(
      'song_submissions',
      new TableForeignKey({
        columnNames: ['room_id'],
        referencedTableName: 'rooms',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'song_submissions',
      new TableForeignKey({
        columnNames: ['submitted_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('song_submissions');
  }
}
