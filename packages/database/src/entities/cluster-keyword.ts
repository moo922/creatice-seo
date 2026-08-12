import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('cluster_keywords')
@Index('idx_cluster_keywords_cluster', ['clusterId', 'keywordId'], { unique: true })
export class ClusterKeyword {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'cluster_id' })
  clusterId: string;

  @Column({ type: 'uuid', name: 'keyword_id' })
  keywordId: string;

  @Column({ type: 'varchar', length: 10 })
  role: string;
}
