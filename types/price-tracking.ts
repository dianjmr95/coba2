export type Product = {
  id: string;
  name: string;
  slug: string;
  target_url: string;
};

export type ProductInsert = {
  id?: string;
  name: string;
  slug: string;
  target_url: string;
};

export type ProductUpdate = {
  id?: string;
  name?: string;
  slug?: string;
  target_url?: string;
};

export type PriceLog = {
  id: string;
  product_id: string;
  price: number;
  store_name: string;
  fetched_at: string;
};

export type PriceLogInsert = {
  id?: string;
  product_id: string;
  price: number;
  store_name: string;
  fetched_at?: string;
};

export type PriceLogUpdate = {
  id?: string;
  product_id?: string;
  price?: number;
  store_name?: string;
  fetched_at?: string;
};

export type PriceLogWithProduct = PriceLog & {
  product?: Pick<Product, "id" | "name" | "slug" | "target_url"> | null;
};

export type PriceTrackingDatabase = {
  public: {
    Tables: {
      products: {
        Row: Product;
        Insert: ProductInsert;
        Update: ProductUpdate;
      };
      price_logs: {
        Row: PriceLog;
        Insert: PriceLogInsert;
        Update: PriceLogUpdate;
      };
    };
  };
};
