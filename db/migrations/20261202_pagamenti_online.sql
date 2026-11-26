-- Pagamenti dall'app: bonifico (l'atleta segnala di averlo fatto) e carta tramite Stripe Checkout
ALTER TABLE lptapp.pagamenti ADD COLUMN IF NOT EXISTS metodo VARCHAR(20);          -- bonifico | stripe | contanti
ALTER TABLE lptapp.pagamenti ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);
ALTER TABLE lptapp.pagamenti ADD COLUMN IF NOT EXISTS segnalato_at TIMESTAMPTZ;    -- "ho fatto il bonifico"
