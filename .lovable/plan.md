# Creator-Konto für bestofproducts4u@gmail.com

## Befund

- Das Konto `bestofproducts4u@gmail.com` (ID `8948d3d9-2c5e-4405-9e9c-1624448e7189`) hat in `profiles` aktuell `account_type = standard` und `ai_discount_percent = 0`.
- Die serverseitige Zugangsregel (`_shared/subscription-entitlement.ts`) lautet: **Zugang = aktives Abo ODER Creator-Konto**. Die UI spiegelt das über `useSubscriptionAccess` / `usePicturePremium` (jeweils `subscribed || isPaid || isCreator`).
- Admin-Rolle und Creator-Konto sind zwei getrennte Dinge: Die Admin-Rolle steuert Admin-Bereiche, der Creator-Status steuert den Feature-Zugang. Genau deshalb kommt das Konto trotz Admin-Rolle nicht in die Features.

## Änderung (eine Daten-Änderung, kein Code)

- `profiles.account_type` für genau dieses eine Konto auf `creator` setzen.
- `ai_discount_percent` bleibt **0** — es wird kein Rabatt aktiviert, nur der Zugang. (Falls du den Creator-Rabatt willst, sag Bescheid, das wäre ein separater Schritt.)
- Die Admin-Rolle bleibt unverändert erhalten.

## Wirkung

- Das Konto kommt sofort in alle Features, die ein aktives Abo oder Creator-Status verlangen (Motion Studio, Picture Studio Premium, Content Command Center, Social Connections usw.) — ohne Upgrade und ohne Abo.
- Keine Änderung an Abrechnung, Wallet, Guthaben, Preisen oder anderen Konten.

## Prüfung

- Nach der Änderung: Abfrage bestätigt `account_type = creator` für dieses Konto.
- Kurzer Login-Check im Preview: eine zuvor gesperrte Feature-Seite öffnet sich ohne Upgrade-Hinweis.

## Technische Details

- Ein `UPDATE public.profiles SET account_type = 'creator' WHERE id = '8948d3d9-2c5e-4405-9e9c-1624448e7189'` über das Daten-Tool.
- Keine Migration, kein Deploy, keine Code-Änderung.
