CREATE TYPE upload_status AS ENUM ('pending', 'scanning', 'complete', 'failed', 'rejected');
CREATE TYPE uploaded_by_role AS ENUM ('client', 'staff', 'staff_on_behalf_of_client');
CREATE TYPE constraint_type AS ENUM ('zoning', 'comparable_sales', 'land_use', 'contamination', 'market_value', 'other');
CREATE TYPE dispute_status AS ENUM ('draft', 'submitted', 'under_review', 'resolved', 'withdrawn');

-- Core tables

CREATE TABLE client (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE property (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id),
  lot_number VARCHAR(100),
  property_address TEXT NOT NULL,
  council_reference VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE valuation_notice (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES property(id),
  notice_date DATE NOT NULL,
  assessed_value DECIMAL(15,2) NOT NULL,
  original_assessed_value DECIMAL(15,2) NOT NULL,
  revised_assessed_value DECIMAL(15,2),
  determined_value DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE valuation_notice_file (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_notice_id UUID NOT NULL REFERENCES valuation_notice(id),
  blob_path TEXT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes INT NOT NULL,
  upload_status upload_status NOT NULL DEFAULT 'pending',
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_by_role uploaded_by_role NOT NULL,
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMP,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dispute_case (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_notice_id UUID NOT NULL REFERENCES valuation_notice(id),
  case_reference VARCHAR(50) NOT NULL UNIQUE,
  status dispute_status NOT NULL DEFAULT 'draft',
  assigned_to UUID REFERENCES users(id),
  lodged_date DATE,
  objection_deadline DATE,
  hearing_date DATE,
  response_due_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dispute_constraint (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_case_id UUID NOT NULL REFERENCES dispute_case(id) ON DELETE CASCADE,
  constraint_type constraint_type NOT NULL,
  description TEXT,
  disputed_value DECIMAL(15,2),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE constraint_file (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_constraint_id UUID NOT NULL REFERENCES dispute_constraint(id) ON DELETE CASCADE,
  document_category constraint_type NOT NULL,
  blob_path TEXT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes INT NOT NULL,
  upload_status upload_status NOT NULL DEFAULT 'pending',
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_by_role uploaded_by_role NOT NULL,
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMP,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Indexes

CREATE INDEX idx_property_client ON property(client_id);
CREATE INDEX idx_valuation_notice_property ON valuation_notice(property_id);
CREATE INDEX idx_dispute_case_notice ON dispute_case(valuation_notice_id);
CREATE INDEX idx_dispute_constraint_case ON dispute_constraint(dispute_case_id);
CREATE INDEX idx_constraint_file_constraint ON constraint_file(dispute_constraint_id);
CREATE INDEX idx_constraint_file_status ON constraint_file(upload_status);
CREATE INDEX idx_valuation_notice_file_notice ON valuation_notice_file(valuation_notice_id);