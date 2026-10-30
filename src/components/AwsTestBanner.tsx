import {isAwsTestBackend} from '@/lib/backendTarget';
export function AwsTestBanner() {
  if (!isAwsTestBackend) return null;
  return <div role="status" className="bg-amber-100 px-3 py-1 text-center text-xs text-amber-950">
    AWS backend · migration validation · selected features only
  </div>;
}
