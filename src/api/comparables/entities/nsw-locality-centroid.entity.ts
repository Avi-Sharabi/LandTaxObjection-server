import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('nsw_locality_centroids')
export class NswLocalityCentroid {
  @PrimaryColumn({ type: 'text' })
  locality: string;

  @Column({ type: 'double precision' })
  lat: number;

  @Column({ type: 'double precision' })
  lng: number;

  @Column({ type: 'text', default: 'arcgis' })
  source: string;

  @Column({ type: 'timestamptz', name: 'geocoded_at' })
  geocoded_at: Date;
}
