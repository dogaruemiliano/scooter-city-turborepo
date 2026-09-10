# Private document-extraction assets

Real receipts used for local Amazon Textract `AnalyzeExpense` benchmarks go in:

```text
test-assets/private/textract/receipts/
```

The entire `test-assets/private/` tree is ignored by Git. Benchmark output is
written to `test-assets/private/textract/results/` with owner-only file
permissions. Neither source images nor extracted receipt values belong in
commits, CI artifacts, screenshots, or application logs.

Validate local files without sending them to AWS:

```bash
pnpm --filter api benchmark:textract -- --dry-run
```

Target one receipt by exact filename when validating or analyzing a new
fixture:

```bash
pnpm --filter api benchmark:textract -- --dry-run --file receipt-example.jpeg
```

Run the real private benchmark with AWS credentials available through the
standard SDK credential chain and `IMAGE_STORAGE_S3_REGION` or `AWS_REGION`
configured. This command transmits every image in the private receipts folder
to Amazon Textract, so run it only when those specific documents are authorized
for external processing:

```bash
pnpm --filter api benchmark:textract
```

Prefer the narrower form when only one document is authorized:

```bash
pnpm --filter api benchmark:textract -- --file receipt-example.jpeg
```
