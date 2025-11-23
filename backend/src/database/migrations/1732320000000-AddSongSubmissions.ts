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
            name: 'roomId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'submittedBy',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'youtubeUrl',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'songTitle',
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
            name: 'voteCount',
            type: 'integer',
            default: 0,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'playedAt',
            type: 'timestamp',
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
        columnNames: ['roomId', 'isActive'],
      }),
    );

    await queryRunner.createForeignKey(
      'song_submissions',
      new TableForeignKey({
        columnNames: ['roomId'],
        referencedTableName: 'rooms',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'song_submissions',
      new TableForeignKey({
        columnNames: ['submittedBy'],
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
