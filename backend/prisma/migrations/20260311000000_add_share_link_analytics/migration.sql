-- CreateTable
CREATE TABLE "ShareLinkOpen" (
    "id" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "sessionId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLinkOpen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLinkDesignView" (
    "id" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "sessionId" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLinkDesignView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShareLinkOpen_shareLinkId_idx" ON "ShareLinkOpen"("shareLinkId");

-- CreateIndex
CREATE INDEX "ShareLinkOpen_openedAt_idx" ON "ShareLinkOpen"("openedAt");

-- CreateIndex
CREATE INDEX "ShareLinkDesignView_shareLinkId_idx" ON "ShareLinkDesignView"("shareLinkId");

-- CreateIndex
CREATE INDEX "ShareLinkDesignView_designId_idx" ON "ShareLinkDesignView"("designId");

-- CreateIndex
CREATE INDEX "ShareLinkDesignView_viewedAt_idx" ON "ShareLinkDesignView"("viewedAt");

-- AddForeignKey
ALTER TABLE "ShareLinkOpen" ADD CONSTRAINT "ShareLinkOpen_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLinkDesignView" ADD CONSTRAINT "ShareLinkDesignView_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLinkDesignView" ADD CONSTRAINT "ShareLinkDesignView_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;
