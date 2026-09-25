import dns from "node:dns/promises";
import tls from "node:tls";
import { isPrivateAddress } from "../url-safety";
import type { DnsInfo, Infrastructure } from "./types";

/** DNS and TLS facts about a host: mail and DNS providers, services verified with TXT records, and the certificate. */

const TWO_LEVEL = /\.(?:co|com|net|org|gov|edu|ac|ne|or)\.[a-z]{2}$/;

/** example.co.uk → example.co.uk, www.shop.example.com → example.com (without the public suffix list). */
export function apexDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  const keep = TWO_LEVEL.test(`.${labels.slice(-3).join(".")}`) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

const MAIL: [RegExp, string][] = [
  [/google\.com$|googlemail\.com$/, "Google Workspace"], [/outlook\.com$|office365|protection\.outlook/, "Microsoft 365"], [/zoho\./, "Zoho Mail"],
  [/pphosted\.com$|proofpoint/, "Proofpoint"], [/mimecast/, "Mimecast"], [/protonmail|proton\.ch/, "Proton Mail"], [/messagingengine\.com$/, "Fastmail"],
  [/secureserver\.net$/, "GoDaddy"], [/titan\.email$/, "Titan"], [/mailgun\.org$/, "Mailgun"], [/amazonaws\.com$|amazonses/, "Amazon SES"],
  [/yandex/, "Yandex Mail"], [/icloud\.com$/, "iCloud Mail"], [/hostinger/, "Hostinger Mail"], [/ovh\.net$/, "OVHcloud"], [/improvmx/, "ImprovMX"],
  [/barracudanetworks/, "Barracuda"], [/forwardemail\.net$/, "Forward Email"], [/migadu/, "Migadu"], [/ionos\./, "IONOS"], [/udag\.de$/, "united-domains"], [/strato/, "STRATO"], [/one\.com$/, "one.com"],
];
const NS: [RegExp, string][] = [
  [/cloudflare\.com$/, "Cloudflare"], [/awsdns/, "Amazon Route 53"], [/azure-dns/, "Azure DNS"], [/googledomains\.com$|google\.com$/, "Google Cloud DNS"],
  [/domaincontrol\.com$/, "GoDaddy"], [/vercel-dns\.com$/, "Vercel"], [/nsone\.net$/, "NS1"], [/netlify/, "Netlify"], [/dnsimple/, "DNSimple"],
  [/digitalocean\.com$/, "DigitalOcean"], [/registrar-servers\.com$/, "Namecheap"], [/dns-parking\.com$|hostinger/, "Hostinger"], [/wixdns\.net$/, "Wix"],
  [/squarespacedns|squarespace/, "Squarespace"], [/ultradns/, "UltraDNS"], [/akam\.net$|akamai/, "Akamai"], [/dynect\.net$/, "Oracle Dyn"], [/gandi\.net$/, "Gandi"],
  [/ovh\.net$/, "OVHcloud"], [/hetzner/, "Hetzner"], [/porkbun/, "Porkbun"], [/name\.com$/, "Name.com"], [/bluehost/, "Bluehost"], [/siteground/, "SiteGround"], [/ui-dns\./, "IONOS"], [/udag\./, "united-domains"], [/strato/, "STRATO"], [/inwx/, "INWX"], [/hostgator/, "HostGator"], [/dreamhost/, "DreamHost"], [/dnsmadeeasy/, "DNS Made Easy"],
];
const VERIFY: [RegExp, string][] = [
  [/^google-site-verification=/, "Google Search Console"], [/^MS=/, "Microsoft 365"], [/^facebook-domain-verification=/, "Meta Business"],
  [/^apple-domain-verification=/, "Apple"], [/^atlassian-domain-verification=/, "Atlassian"], [/^docusign=/, "DocuSign"], [/^adobe-idp-site-verification=/, "Adobe"],
  [/^stripe-verification=/, "Stripe"], [/^slack-domain-verification=/, "Slack"], [/^ZOOM_verify_/i, "Zoom"], [/^openai-domain-verification=/, "OpenAI"],
  [/^anthropic-domain-verification/, "Anthropic"], [/^miro-verification=/, "Miro"], [/^canva-site-verification=/, "Canva"], [/^pinterest-site-verification=/, "Pinterest"],
  [/^ahrefs-site-verification_/, "Ahrefs"], [/^yandex-verification:/, "Yandex"], [/^have-i-been-pwned-verification=/, "Have I Been Pwned"],
  [/^hubspot-developer-verification=|^hubspot-site-verification/, "HubSpot"], [/^dropbox-domain-verification=/, "Dropbox"], [/^teamviewer-sso-verification=/, "TeamViewer"],
  [/^cisco-ci-domain-verification=/, "Cisco Webex"], [/^globalsign-domain-verification=/, "GlobalSign"], [/^mongodb-site-verification=/, "MongoDB"],
  [/^postman-domain-verification=/, "Postman"], [/^figma-domain-verification/, "Figma"], [/^notion-domain-verification/, "Notion"], [/^linear-domain-verification/, "Linear"],
  [/^vercel-domain-verification|^_vercel/, "Vercel"], [/^heroku-domain-verification=/, "Heroku"], [/^klaviyo-site-verification=/, "Klaviyo"], [/^brevo-code:|^Sendinblue-code:/, "Brevo"],
  [/^mailchimp=|^mandrill_verify/, "Mailchimp"], [/^shopify-verification-code=/, "Shopify"], [/^wix-verification-code=/, "Wix"], [/^webexdomainverification/, "Cisco Webex"],
  [/^amazonses:/, "Amazon SES"], [/^cursor-domain-verification/, "Cursor"], [/^github-verification/i, "GitHub"], [/^gitlab-/, "GitLab"], [/^loom-site-verification/, "Loom"],
  [/^smartsheet-site-validation/, "Smartsheet"], [/^intercom-/, "Intercom"], [/^zapier-domain-verification/, "Zapier"], [/^asana-/, "Asana"],
];
const SENDERS: [RegExp, string][] = [
  [/_spf\.google\.com/, "Google Workspace"], [/spf\.protection\.outlook\.com/, "Microsoft 365"], [/sendgrid\.net/, "SendGrid"], [/mailgun\.org/, "Mailgun"],
  [/amazonses\.com/, "Amazon SES"], [/servers\.mcsv\.net|mcsv\.net/, "Mailchimp"], [/mandrillapp\.com/, "Mandrill"], [/_spf\.salesforce\.com/, "Salesforce"],
  [/hubspotemail\.net|hubspot/, "HubSpot"], [/mail\.zendesk\.com/, "Zendesk"], [/spf\.mtasv\.net/, "Postmark"], [/sparkpostmail\.com/, "SparkPost"],
  [/zoho\./, "Zoho"], [/sendinblue|brevo/, "Brevo"], [/klaviyo/, "Klaviyo"], [/freshdesk|freshemail/, "Freshdesk"], [/helpscoutemail/, "Help Scout"],
  [/intercom/, "Intercom"], [/shopify/, "Shopify"], [/mktomail|marketo/, "Marketo"], [/pphosted/, "Proofpoint"], [/mimecast/, "Mimecast"], [/customer\.io/, "Customer.io"],
  [/stripe\.com/, "Stripe"], [/atlassian/, "Atlassian"], [/_spf\.resend|resend\.com|amazonses\.com.*resend/, "Resend"], [/secureserver\.net/, "GoDaddy"],
];

const name = (value: string, table: [RegExp, string][]) => table.find(([pattern]) => pattern.test(value.toLowerCase()))?.[1] ?? null;
const within = <T>(promise: Promise<T>, ms: number, fallback: T) => Promise.race([promise.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

export async function lookupDns(host: string): Promise<DnsInfo> {
  const domain = apexDomain(host);
  const resolver = new dns.Resolver({ timeout: 3000, tries: 1 });
  const [ns, mx, txt, dmarc] = await Promise.all([
    within(resolver.resolveNs(domain), 5000, [] as string[]),
    within(resolver.resolveMx(domain), 5000, [] as { exchange: string; priority: number }[]),
    within(resolver.resolveTxt(domain), 5000, [] as string[][]),
    within(resolver.resolveTxt(`_dmarc.${domain}`), 5000, [] as string[][]),
  ]);
  const records = txt.map((parts) => parts.join(""));
  const spf = records.find((record) => /^v=spf1/i.test(record)) ?? "";
  const includes = [...spf.matchAll(/include:(\S+)/gi)].map((match) => match[1]);
  const mxHosts = mx.sort((a, b) => a.priority - b.priority).map((item) => item.exchange.toLowerCase());
  return {
    domain,
    nameservers: ns.map((item) => item.toLowerCase()).sort(),
    dnsProvider: ns.map((item) => name(item, NS)).find(Boolean) ?? null,
    mx: mxHosts,
    mailProvider: mxHosts.map((item) => name(item, MAIL)).find(Boolean) ?? null,
    verifiedServices: [...new Set(records.map((record) => name(record, VERIFY)).filter((item): item is string => !!item))].sort(),
    emailSenders: [...new Set(includes.map((item) => name(item, SENDERS) ?? item))],
    dmarc: dmarc.map((parts) => parts.join("")).find((record) => /^v=DMARC1/i.test(record))?.match(/\bp=(\w+)/i)?.[1] ?? null,
  };
}

/** The certificate the site presents. Connects only to a public address the hostname resolves to. */
export async function readCertificate(host: string): Promise<{ tls: Infrastructure["tls"]; ips: string[] }> {
  const addresses = await within(dns.lookup(host, { all: true, verbatim: true }), 4000, [] as { address: string; family: number }[]);
  const ips = addresses.map((item) => item.address);
  const target = addresses.find((item) => !isPrivateAddress(item.address));
  if (!target || addresses.some((item) => isPrivateAddress(item.address))) return { tls: null, ips };
  const certificate = await within(new Promise<Infrastructure["tls"]>((resolve, reject) => {
    const socket = tls.connect({ host: target.address, port: 443, servername: host, rejectUnauthorized: false, timeout: 5000 }, () => {
      const cert = socket.getPeerCertificate();
      const issuer = cert?.issuer ? [cert.issuer.O, cert.issuer.CN].filter(Boolean).join(" · ") : null;
      resolve({ issuer: issuer || null, validTo: cert?.valid_to ? new Date(cert.valid_to).toISOString() : null, protocol: socket.getProtocol(), altNames: cert?.subjectaltname ? cert.subjectaltname.split(",").length : 0 });
      socket.end();
    });
    socket.on("error", reject);
    socket.on("timeout", () => { socket.destroy(); reject(new Error("timeout")); });
  }), 6000, null);
  return { tls: certificate, ips };
}
