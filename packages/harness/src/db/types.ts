export interface HarnessDb {
  select(): any;
  insert(table: unknown): any;
  update(table: unknown): any;
  delete(table: unknown): any;
}
