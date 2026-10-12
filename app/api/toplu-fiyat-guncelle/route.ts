import { POST as handlePriceUpdate, GET as handleBatchStatus } from "@/app/api/fiyat-guncelle/route";

export const dynamic = "force-dynamic";

export const POST = handlePriceUpdate;
export const GET = handleBatchStatus;
