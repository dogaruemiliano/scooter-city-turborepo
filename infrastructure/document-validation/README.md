# Isolated scooter-document validation

This Lambda reads private scooter originals, verifies the complete SHA-256 and media signatures, checks actual original PDF page counts (1–10), and prepares PDFs that open with an empty password. It writes every accepted source as an immutable private analysis snapshot. Rotation metadata is normalized for compatible PDFs. Source objects are never changed. No raster rendering, database access or OpenAI credentials are needed by Lambda.

The Nest API sends small source descriptors through `DocumentValidationService`; it never downloads the file. Jobs must persist the intended `extraction-temporary` key before invoking Lambda and retain that resource record after timeout/cancellation. The function has a hard 60-second limit; the API invokes it with a 65-second deadline and SDK retries disabled. Cleanup must respect the possible late-write window. Repeated invocations reuse a matching snapshot and cannot overwrite another source's snapshot.

Local development can set `SCOOTER_DOCUMENT_VALIDATION_DRIVER=local` to execute this same handler in a separate bounded Node process. That mode uses the developer's AWS identity for source reads and temporary snapshot writes and is forbidden in production. See the [local setup instructions](../../docs/scooters/background-document-extraction.md#local-development). Production API permissions remain unchanged: only Lambda writes temporary snapshots.

For the current development bucket, [development-s3-policy.json](./development-s3-policy.json) is an additive IAM policy for `scooter-city-api-dev`. It grants listing only under the scooter-original and validation-temporary prefixes, version reads/deletions there, and temporary snapshot writes. Attach it as an additional policy using an AWS identity authorized to manage IAM; do not replace existing policies. The application credentials themselves do not have IAM management access. Production uses the CloudFormation policy below instead.

## Build and verify

From the repository root, after `pnpm install` and building shared packages:

```sh
node infrastructure/document-validation/build.mjs
pnpm --filter api exec jest --runInBand --watchman=false document-validation scooter-document-source-reader image-storage.service
```

The ZIP is `infrastructure/document-validation/dist/document-validation.zip`. It bundles the pinned S3 SDK and pure JavaScript PDF dependencies for Node.js 24/ARM64. Build validation rejects accidental Nest, Prisma, OpenAI, canvas or PDF-rendering dependencies. Bundled console calls are removed because PDF-library warnings can contain document fragments; AWS runtime duration/memory logs remain available. `dist/dependencies.json` records the bundled inputs. The ZIP is a build artifact and is not committed.

## Deployment inputs

Upload the ZIP under an immutable code key in an existing deployment-artifact bucket in the same region. Deploy `template.json` with CloudFormation and `CAPABILITY_IAM`, passing `CodeBucket`, `CodeKey`, the existing `StorageBucketName` and `StoragePrefix`, and the storage CMK ARN if configured. The template deliberately does not take ownership of the existing storage bucket or change its policy/lifecycle.

The stack creates the function, its execution role, a 14-day log group, and an API managed policy. Attach `ApiValidationPolicyArn` to the existing API AWS identity. Set `SCOOTER_DOCUMENT_VALIDATION_FUNCTION_NAME` to the stack's function name. Keep `SCOOTER_DOCUMENT_EXTRACTION_JOBS_ENABLED=false` until staging verification succeeds. Both services must use the existing bucket/region/prefix; set `MaxDocumentBytes` to the smaller of `IMAGE_STORAGE_MAX_BYTES` and 15728640.

`NativeDetailViews` defaults to `false` and sets Lambda's `DOCUMENT_VALIDATION_DETAIL_VIEWS`. When enabled, the prepared analysis PDF retains its full original-page sequence and appends four overlapping native detail views per page, each labelled with its original page/region. Embedded streams are reused without image resampling. Annotation-bearing PDFs retain their appearances. The original-page limit remains ten; prepared byte limits still apply and fail explicitly. Compare private real-scan accuracy, usage and latency before enabling this option. Development uses the same boolean on the API environment, passed explicitly into the isolated worker; no other API credentials are inherited.

Lambda's role reads only `${StoragePrefix}/scooter-documents/` and `${StoragePrefix}/extraction-temporary/`. It can write only temporary objects, with `If-None-Match: *`. Its list permission is scoped to those prefixes. API additions allow invoking this function, reading snapshots, and deleting exact tracked keys and their versions. Existing upload permissions remain separately managed. A CMK key policy must also permit the roles; IAM statements alone cannot override a restrictive key policy. Snapshot HEAD checksum retrieval and signed GET need the relevant KMS permissions.

Ensure no browser upload presigner or other service can write to `extraction-temporary`. Do not grant the API a new write permission for that prefix. Account/bucket policies can grant extra permissions beyond the role policy, so inspect the combined policy when provisioning.

`ReservedConcurrency` defaults to two executions. If AWS rejects creation because this would reduce unreserved account concurrency below its minimum, set this stack parameter to `0`. The template then omits `ReservedConcurrentExecutions`, allowing shared account capacity; it does not set Lambda's actual reservation to zero, which would disable invocations. This removes the function-specific concurrency cap and reservation. Application job admission limits still apply, and shared capacity may be throttled by other functions. Restore a positive reservation after obtaining enough regional quota if dedicated capacity is needed.

For a stack in `ROLLBACK_COMPLETE`, delete the failed stack and create it again with the updated template and parameter. This template does not manage the existing S3 bucket, so deleting this failed stack does not delete the bucket or uploaded files. The Lambda ZIP is unchanged.

## Temporary-object lifecycle safeguard

`lifecycle-rules.example.json` contains two prefix-scoped rules: one-day expiry of current/noncurrent temporary versions, and deletion of expired markers. Replace the placeholder with the exact configured prefix and **merge** the two entries into the bucket's current lifecycle rules. Read and preserve every existing rule first; `put-bucket-lifecycle-configuration` replaces the entire configuration. Review the resulting configuration before applying it. Never use the broader storage prefix or `scooter-documents/` as the expiration filter: saved originals retain those keys.

Lifecycle is an eventual backup, not job cleanup. The database resource ledger and version-aware deletion remain authoritative. Temporary reconciliation enumerates current/noncurrent versions and delete markers, with an opaque durable key/version cursor, so hidden orphan versions are discoverable too. `deleteDocumentForCleanup` enumerates exact-key versions/delete markers, checks per-item delete failures, and bounds each pass. Keep tombstones for repeated late-write reconciliation. Enabling S3 Object Lock, MFA Delete or restrictive retention requires an explicit operational cleanup policy; failures must remain visible and retryable.

## Staging checks

Use synthetic JPEG/PNG/WebP, ordinary multipage PDFs, empty-password RC4/AES PDFs and a true-password PDF. Confirm original byte identity, prepared PDF fidelity, exact size/page errors, bad checksum rejection, repeated invocation reuse and cancelled/late-write cleanup. Confirm signed snapshot GET succeeds from outside the API and passes its checksum, then verify version-aware cleanup removes every snapshot version. Exercise missing KMS/list/delete permissions and check that job cleanup remains pending. Measure Lambda memory/duration and API RSS separately.

AWS interfaces were checked on 2026-10-12: [Invoke](https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html), [Node.js runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html), [HEAD checksums](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html), [conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html), [version listing](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectVersions.html), [multi-object deletion](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html), and [lifecycle rules](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-configuration-examples.html).
