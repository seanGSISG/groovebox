import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class AddMessagesTable1732260000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'messages',
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
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'content',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create index for room messages
    await queryRunner.createIndex(
      'messages',
      new TableIndex({
        name: 'idx_room_messages',
        columnNames: ['room_id', 'created_at'],
      }),
    );

    // Create foreign key for room
    await queryRunner.createForeignKey(
      'messages',
      new TableForeignKey({
        columnNames: ['room_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'rooms',
        onDelete: 'CASCADE',
      }),
    );

    // Create foreign key for user
    await queryRunner.createForeignKey(
      'messages',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('messages');

    if (table) {
      // Drop foreign keys
      const userForeignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('user_id') !== -1,
      );
      if (userForeignKey) {
        await queryRunner.dropForeignKey('messages', userForeignKey);
      }

      const roomForeignKey = table.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('room_id') !== -1,
      );
      if (roomForeignKey) {
        await queryRunner.dropForeignKey('messages', roomForeignKey);
      }

      // Drop index
      await queryRunner.dropIndex('messages', 'idx_room_messages');
    }

    // Drop table
    await queryRunner.dropTable('messages', true);
  }
}
