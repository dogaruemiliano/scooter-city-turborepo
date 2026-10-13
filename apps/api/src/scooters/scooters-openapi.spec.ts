import { AccessService } from "../access/access.service";
import { CivVocabularyController } from "./civ-vocabulary.controller";
import { CivVocabularyService } from "./civ-vocabulary.service";
import { ScooterDocumentsService } from "./scooter-documents.service";
import { ScooterDocumentsController } from "./scooter-documents.controller";
import {
  ScooterPhotosController,
  ScooterPhotoDraftsController,
} from "./scooter-photos.controller";
import { ScooterPhotosService } from "./scooter-photos.service";
import { ScooterDocumentJobsController } from "../scooter-document-jobs/scooter-document-jobs.controller";
import { ScooterDocumentJobsService } from "../scooter-document-jobs/scooter-document-jobs.service";
import { Test } from "@nestjs/testing";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";

import { ScootersController } from "./scooters.controller";
import { ScootersService } from "./scooters.service";

describe("Scooter OpenAPI document", () => {
  it("generates request and response schemas without losing registry constraints", async () => {
    const module = await Test.createTestingModule({
      controllers: [
        ScootersController,
        ScooterDocumentsController,
        ScooterPhotosController,
        ScooterPhotoDraftsController,
        ScooterDocumentJobsController,
        CivVocabularyController,
      ],
      providers: [
        { provide: AccessService, useValue: {} },
        { provide: CivVocabularyService, useValue: {} },
        { provide: ScootersService, useValue: {} },
        { provide: ScooterDocumentsService, useValue: {} },
        { provide: ScooterPhotosService, useValue: {} },
        { provide: ScooterDocumentJobsService, useValue: {} },
      ],
    }).compile();
    const app = module.createNestApplication();

    try {
      const document = cleanupOpenApiDoc(
        SwaggerModule.createDocument(app, new DocumentBuilder().build()),
      );
      expect(document.paths["/scooters"].post).toBeDefined();
      expect(
        document.paths["/scooters/photo-draft-upload-url"].post?.responses[201],
      ).toBeDefined();
      expect(document.paths["/scooters/{id}/photos"].get).toBeDefined();
      expect(
        document.paths["/scooters/{id}/photos"].post?.responses[201],
      ).toBeDefined();
      expect(
        document.paths["/scooters/{id}/photos/{photoId}"].patch,
      ).toBeDefined();
      expect(document.paths["/vehicle-civ/vocabulary"].get).toBeDefined();
      expect(document.paths["/scooters/{id}"].patch).toBeDefined();
      expect(
        document.paths["/scooters/document-extraction"].post?.responses[503],
      ).toBeDefined();
      expect(
        document.paths["/scooters/document-extraction"].post?.deprecated,
      ).toBe(true);
      expect(
        document.paths["/scooters/document-extraction-jobs"].post
          ?.responses[202],
      ).toBeDefined();
      expect(
        document.components?.schemas?.AnalyzeScooterDocumentInput,
      ).toBeDefined();
      const schemas = Object.values(document.components?.schemas ?? {});
      expect(
        schemas.find(
          (schema) =>
            "properties" in schema &&
            schema.properties?.extractedData &&
            schema.properties?.reviewRequired,
        ),
      ).toBeDefined();
      const registrySchemas = schemas.flatMap((schema) =>
        "properties" in schema && schema.properties?.nationalRegistryNumber
          ? [schema.properties.nationalRegistryNumber]
          : [],
      );
      expect(registrySchemas.length).toBeGreaterThanOrEqual(3);
      for (const registry of registrySchemas) {
        expect(registry).toMatchObject({
          type: "string",
          nullable: true,
          minLength: 1,
          maxLength: 120,
        });
      }
    } finally {
      await app.close();
    }
  });
});
