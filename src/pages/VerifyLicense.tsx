import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, XCircle, ShieldAlert, ExternalLink, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface VerifyResponse {
  valid: boolean;
  revoked?: boolean;
  certificate?: {
    certificate_number: string;
    asset_title: string;
    asset_type: string;
    asset_thumbnail_url: string | null;
    source_provider: string;
    provider_license_name: string;
    provider_license_url: string | null;
    license_tier: string;
    permitted_uses: string[];
    restrictions: string[];
    attribution_required: boolean;
    issued_at: string;
    revoked_at: string | null;
    licensee_initials: string;
  };
}

export default function VerifyLicense() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");
  const [data, setData] = useState<VerifyResponse | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-license-certificate?token=${encodeURIComponent(token)}`,
    )
      .then((r) => r.json())
      .then((r: VerifyResponse) => {
        setData(r);
        setState(r.certificate ? "ok" : "fail");
      })
      .catch(() => setState("fail"));
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="max-w-2xl w-full p-8 bg-card/60 backdrop-blur border-primary/20">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/" className="font-serif text-2xl text-primary">LOVABLE</Link>
          <Badge variant="outline" className="ml-auto">License Verification</Badge>
        </div>

        {state === "loading" && (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            Verifying certificate…
          </div>
        )}

        {state === "fail" && (
          <div className="text-center py-12">
            <XCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
            <h1 className="text-2xl font-bold mb-2">Certificate Not Found</h1>
            <p className="text-muted-foreground">
              This token does not match any certificate in our system.
            </p>
          </div>
        )}

        {state === "ok" && data?.certificate && (
          <div className="space-y-6">
            <div className="text-center">
              {data.valid ? (
                <>
                  <CheckCircle2 className="w-16 h-16 mx-auto text-green-500 mb-3" />
                  <h1 className="text-2xl font-bold">Valid License Certificate</h1>
                  <p className="text-sm text-muted-foreground">
                    #{data.certificate.certificate_number}
                  </p>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-16 h-16 mx-auto text-amber-500 mb-3" />
                  <h1 className="text-2xl font-bold">Certificate Revoked</h1>
                  <p className="text-sm text-muted-foreground">
                    Revoked on {new Date(data.certificate.revoked_at!).toLocaleDateString()}
                  </p>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Asset" value={data.certificate.asset_title} />
              <Field label="Type" value={data.certificate.asset_type} />
              <Field label="Source" value={data.certificate.source_provider} />
              <Field
                label="Issued"
                value={new Date(data.certificate.issued_at).toLocaleDateString()}
              />
              <Field
                label="Tier"
                value={data.certificate.license_tier.toUpperCase()}
              />
              <Field label="Licensee" value={data.certificate.licensee_initials + ".".repeat(2)} />
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase text-primary mb-2">
                Source License
              </h3>
              <p className="text-sm">{data.certificate.provider_license_name}</p>
              {data.certificate.provider_license_url && (
                <Button
                  asChild
                  variant="link"
                  size="sm"
                  className="px-0 h-auto text-primary"
                >
                  <a
                    href={data.certificate.provider_license_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View original license <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </Button>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-bold uppercase text-primary mb-2">
                  Permitted
                </h3>
                <ul className="text-sm space-y-1">
                  {data.certificate.permitted_uses.map((u) => (
                    <li key={u}>+ {u}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase text-primary mb-2">
                  Restrictions
                </h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {data.certificate.restrictions.map((r) => (
                    <li key={r}>− {r}</li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="text-xs text-muted-foreground italic pt-4 border-t border-border">
              This certificate confirms the licensee's right to use the asset under the
              source license. Lovable acts as facilitator and warrants metadata
              integrity.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
