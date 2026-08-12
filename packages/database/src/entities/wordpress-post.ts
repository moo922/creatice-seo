import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('wp_posts')
@Index('idx_wp_posts_site_id', ['siteId'])
@Index('idx_wp_posts_site_wp_post', ['siteId', 'wpPostId'], { unique: true })
@Index('idx_wp_posts_site_modified', ['siteId', 'modifiedAt'])
export class WordPressPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId: string;

  @Column({ type: 'bigint', name: 'wp_post_id' })
  wpPostId: string;

  @Column({ type: 'varchar', length: 50, name: 'post_type' })
  postType: string;

  @Column({ type: 'text', name: 'url' })
  url: string;

  @Column({ type: 'varchar', length: 255, name: 'slug' })
  slug: string;

  @Column({ type: 'varchar', length: 50, name: 'status' })
  status: string;

  @Column({ type: 'text', name: 'title' })
  title: string;

  @Column({ type: 'char', length: 40, name: 'content_hash' })
  contentHash: string;

  @Column({ type: 'jsonb', name: 'rank_math', default: () => "'{}'" })
  rankMath: Record<string, unknown>;

  @Column({ type: 'jsonb', name: 'meta', default: () => "'{}'" })
  meta: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'modified_at' })
  modifiedAt: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
