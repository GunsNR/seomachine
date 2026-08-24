-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "dataMode" TEXT NOT NULL DEFAULT 'live',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'trialing',
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "pastDueSince" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Project" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'us',
    "dataMode" TEXT NOT NULL DEFAULT 'live',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Keyword" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "volume" INTEGER NOT NULL DEFAULT 0,
    "difficulty" INTEGER NOT NULL DEFAULT 0,
    "cpc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "intent" TEXT NOT NULL DEFAULT 'informational',
    "trend" TEXT NOT NULL DEFAULT '[]',
    "dataSource" TEXT NOT NULL DEFAULT 'estimated',
    "volumeSource" TEXT NOT NULL DEFAULT 'estimated',
    "difficultySource" TEXT NOT NULL DEFAULT 'estimated',
    "cpcSource" TEXT NOT NULL DEFAULT 'estimated',
    "dataProvider" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RankSnapshot" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'google',
    "position" INTEGER NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiPrompt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "cluster" TEXT NOT NULL DEFAULT 'general',
    "intent" TEXT NOT NULL DEFAULT 'informational',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiCheck" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "brandMentioned" BOOLEAN NOT NULL DEFAULT false,
    "brandCited" BOOLEAN NOT NULL DEFAULT false,
    "mentionRank" INTEGER NOT NULL DEFAULT 0,
    "sentiment" TEXT NOT NULL DEFAULT 'neutral',
    "shareOfVoice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "citedUrls" TEXT NOT NULL DEFAULT '[]',
    "competitors" TEXT NOT NULL DEFAULT '[]',
    "excerpt" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'unavailable',
    "errorCategory" TEXT NOT NULL DEFAULT '',
    "errorDetail" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Competitor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "score" INTEGER NOT NULL DEFAULT 0,
    "pagesCrawled" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditIssue" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'notice',
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'onpage',

    CONSTRAINT "AuditIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContentBrief" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "targetKeyword" TEXT NOT NULL,
    "intent" TEXT NOT NULL DEFAULT 'informational',
    "outline" TEXT NOT NULL DEFAULT '[]',
    "questions" TEXT NOT NULL DEFAULT '[]',
    "targetWords" INTEGER NOT NULL DEFAULT 1800,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Article" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "briefId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "metaTitle" TEXT NOT NULL DEFAULT '',
    "metaDescription" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "seoScore" INTEGER NOT NULL DEFAULT 0,
    "aiReadyScore" INTEGER NOT NULL DEFAULT 0,
    "readability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "wpPostId" INTEGER,
    "publishedUrl" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Backlink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "anchor" TEXT NOT NULL DEFAULT '',
    "dofollow" BOOLEAN NOT NULL DEFAULT true,
    "authority" INTEGER NOT NULL DEFAULT 0,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Backlink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Lead" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "engine" TEXT NOT NULL DEFAULT '',
    "landingUrl" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'new',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SiteConnection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'wordpress',
    "siteUrl" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "appPassword" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApiKey" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'WordPress plugin',
    "prefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scopes" TEXT NOT NULL DEFAULT '',
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "dailyQuota" INTEGER NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "usageDay" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContactInquiry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'contact-form',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MeasurementRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "dataMode" TEXT NOT NULL DEFAULT 'live',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "promptSetVersion" TEXT NOT NULL DEFAULT '',
    "methodologyVersion" TEXT NOT NULL DEFAULT 'm1',
    "samplesPerPair" INTEGER NOT NULL DEFAULT 1,
    "localeTag" TEXT NOT NULL DEFAULT 'en-US',
    "regionCode" TEXT NOT NULL DEFAULT 'US',
    "expectedObservations" INTEGER NOT NULL DEFAULT 0,
    "observedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "unavailableCount" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "usageReportedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "MeasurementRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Observation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "promptTextSnapshot" TEXT NOT NULL DEFAULT '',
    "promptVersion" TEXT NOT NULL DEFAULT '',
    "promptCluster" TEXT NOT NULL DEFAULT '',
    "engine" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT '',
    "accessMethod" TEXT NOT NULL DEFAULT '',
    "modelRequested" TEXT NOT NULL DEFAULT '',
    "modelReturned" TEXT NOT NULL DEFAULT '',
    "groundingRequested" BOOLEAN NOT NULL DEFAULT false,
    "groundingConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sampleIndex" INTEGER NOT NULL DEFAULT 0,
    "localeTag" TEXT NOT NULL DEFAULT 'en-US',
    "regionCode" TEXT NOT NULL DEFAULT 'US',
    "status" TEXT NOT NULL DEFAULT 'unavailable',
    "errorCategory" TEXT NOT NULL DEFAULT '',
    "errorDetail" TEXT NOT NULL DEFAULT '',
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "brandMentioned" BOOLEAN NOT NULL DEFAULT false,
    "brandCited" BOOLEAN NOT NULL DEFAULT false,
    "mentionRank" INTEGER NOT NULL DEFAULT 0,
    "sentiment" TEXT NOT NULL DEFAULT 'neutral',
    "shareOfVoice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "citedUrls" TEXT NOT NULL DEFAULT '[]',
    "competitors" TEXT NOT NULL DEFAULT '[]',
    "evidenceExcerpt" TEXT NOT NULL DEFAULT '',
    "rawAnswerHash" TEXT NOT NULL DEFAULT '',
    "parserVersion" TEXT NOT NULL DEFAULT 'p1',
    "methodologyVersion" TEXT NOT NULL DEFAULT 'm1',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT NOT NULL DEFAULT '',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "ipHash" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Job" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "idempotencyKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "errorCategory" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JobLock" (
    "key" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."RateLimitCounter" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "public"."PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "public"."PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "public"."PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ProcessedWebhookEvent_processedAt_idx" ON "public"."ProcessedWebhookEvent"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "public"."Organization"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "public"."Organization"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "public"."Membership"("userId", "orgId");

-- CreateIndex
CREATE INDEX "Project_orgId_idx" ON "public"."Project"("orgId");

-- CreateIndex
CREATE INDEX "Keyword_projectId_idx" ON "public"."Keyword"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_projectId_phrase_key" ON "public"."Keyword"("projectId", "phrase");

-- CreateIndex
CREATE INDEX "RankSnapshot_keywordId_capturedAt_idx" ON "public"."RankSnapshot"("keywordId", "capturedAt");

-- CreateIndex
CREATE INDEX "AiPrompt_projectId_idx" ON "public"."AiPrompt"("projectId");

-- CreateIndex
CREATE INDEX "AiCheck_promptId_runAt_idx" ON "public"."AiCheck"("promptId", "runAt");

-- CreateIndex
CREATE INDEX "AiCheck_engine_runAt_idx" ON "public"."AiCheck"("engine", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_projectId_domain_key" ON "public"."Competitor"("projectId", "domain");

-- CreateIndex
CREATE INDEX "AuditRun_projectId_startedAt_idx" ON "public"."AuditRun"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "AuditIssue_auditId_severity_idx" ON "public"."AuditIssue"("auditId", "severity");

-- CreateIndex
CREATE INDEX "Article_projectId_status_idx" ON "public"."Article"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Article_projectId_slug_key" ON "public"."Article"("projectId", "slug");

-- CreateIndex
CREATE INDEX "Backlink_projectId_idx" ON "public"."Backlink"("projectId");

-- CreateIndex
CREATE INDEX "Lead_projectId_capturedAt_idx" ON "public"."Lead"("projectId", "capturedAt");

-- CreateIndex
CREATE INDEX "ApiKey_projectId_idx" ON "public"."ApiKey"("projectId");

-- CreateIndex
CREATE INDEX "ApiKey_prefix_idx" ON "public"."ApiKey"("prefix");

-- CreateIndex
CREATE INDEX "ContactInquiry_createdAt_idx" ON "public"."ContactInquiry"("createdAt");

-- CreateIndex
CREATE INDEX "MeasurementRun_projectId_startedAt_idx" ON "public"."MeasurementRun"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "MeasurementRun_orgId_startedAt_idx" ON "public"."MeasurementRun"("orgId", "startedAt");

-- CreateIndex
CREATE INDEX "MeasurementRun_status_idx" ON "public"."MeasurementRun"("status");

-- CreateIndex
CREATE INDEX "Observation_runId_idx" ON "public"."Observation"("runId");

-- CreateIndex
CREATE INDEX "Observation_engine_observedAt_idx" ON "public"."Observation"("engine", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Observation_runId_promptId_engine_sampleIndex_key" ON "public"."Observation"("runId", "promptId", "engine", "sampleIndex");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "public"."Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Job_status_runAfter_idx" ON "public"."Job"("status", "runAfter");

-- CreateIndex
CREATE INDEX "Job_orgId_idx" ON "public"."Job"("orgId");

-- CreateIndex
CREATE INDEX "Job_kind_status_idx" ON "public"."Job"("kind", "status");

-- CreateIndex
CREATE INDEX "Job_leaseExpiresAt_idx" ON "public"."Job"("leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "public"."Job"("idempotencyKey");

-- CreateIndex
CREATE INDEX "JobLock_expiresAt_idx" ON "public"."JobLock"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimitCounter_resetAt_idx" ON "public"."RateLimitCounter"("resetAt");

-- AddForeignKey
ALTER TABLE "public"."PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Keyword" ADD CONSTRAINT "Keyword_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RankSnapshot" ADD CONSTRAINT "RankSnapshot_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "public"."Keyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiPrompt" ADD CONSTRAINT "AiPrompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiCheck" ADD CONSTRAINT "AiCheck_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "public"."AiPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Competitor" ADD CONSTRAINT "Competitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditRun" ADD CONSTRAINT "AuditRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditIssue" ADD CONSTRAINT "AuditIssue_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "public"."AuditRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentBrief" ADD CONSTRAINT "ContentBrief_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Article" ADD CONSTRAINT "Article_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Article" ADD CONSTRAINT "Article_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "public"."ContentBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Backlink" ADD CONSTRAINT "Backlink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SiteConnection" ADD CONSTRAINT "SiteConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApiKey" ADD CONSTRAINT "ApiKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MeasurementRun" ADD CONSTRAINT "MeasurementRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Observation" ADD CONSTRAINT "Observation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "public"."MeasurementRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
