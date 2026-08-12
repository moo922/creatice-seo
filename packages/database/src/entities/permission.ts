import { Column, Entity, ManyToMany, PrimaryColumn } from 'typeorm';
import { Role } from './role';

@Entity('permissions')
export class Permission {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'varchar', length: 50 })
  module: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}
