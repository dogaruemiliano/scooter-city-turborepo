-- A staged document may be classified by the extraction job. Saved documents remain typed.
ALTER TABLE "ScooterDocumentJob" ALTER COLUMN "documentType" DROP NOT NULL;
