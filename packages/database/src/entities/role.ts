import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryColumn,
} from 'typeorm';
import { Permission } from './permission';
import { User } from './user';

@Entity('roles')
export class Role {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  key: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', name: 'is_system', default: true })
  isSystem: boolean;

  @ManyToMany(() => Permission, (permission) => permission.roles, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_key', referencedColumnName: 'key' },
    inverseJoinColumn: { name: 'permission_key', referencedColumnName: 'key' },
  })
  permissions: Permission[];

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];
}
