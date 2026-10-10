import { CivVocabularyController } from "./civ-vocabulary.controller";
import { CivVocabularyService } from "./civ-vocabulary.service";
import { ScooterDocumentsService } from "./scooter-documents.service";
import { ScooterDocumentsController } from "./scooter-documents.controller";
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
        CivVocabularyController,
      ],
      providers: [
        { provide: CivVocabularyService, useValue: {} },
        { provide: ScootersService, useValue: {} },
        { provide: ScooterDocumentsService, useValue: {} },
      ],
    }).compile();
    const app = module.createNestApplication();

    try {
      const document = cleanupOpenApiDoc(
        SwaggerModule.createDocument(app, new DocumentBuilder().build()),
      );
      expect(document.paths["/scooters"].post).toBeDefined();
      expect(document.paths["/vehicle-civ/vocabulary"].get).toBeDefined();
      expect(document.paths["/scooters/{id}"].patch).toBeDefined();
      const schemas = Object.values(document.components?.schemas ?? {});
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
