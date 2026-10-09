"""DEV-ONLY: builds the synthetic STAGING workbooks to upload (as Google Sheets) in the STAGING account.

- AURA_STAGING_DATA_HUB_SINTETICO.xlsx: the tables AURA reads before it creates its own ones
  (MKT_OPPORTUNITIES, MKT_ACCOUNTS, MKT_CONTACTS_SECURE, MKT_EMAIL_QUEUE), headers taken from the
  repository schema, with fictitious accounts/contacts (example.test). No customer data.
- AURA_STAGING_NOVA_SOURCE_SINTETICO.xlsx: the five NOVA tabs AURA reads, intentionally empty
  (header only), so in STAGING opportunities come only from the synthetic Gmail report.
Usage: python tools/staging/make_staging_seed.py   (needs node for the schema export)
"""
import json, os, subprocess
from openpyxl import Workbook

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(HERE, "seed")
schema = json.loads(subprocess.check_output(["node", "-e", """
const fs=require('fs'),vm=require('vm');const c={};vm.createContext(c);
vm.runInContext(fs.readFileSync('backend/apps-script-v6/MarketingV6SchemaMigration.gs','utf8')+';this.__s=MKT_V6_CONTACT_RECIPIENT_SCHEMA;',c);
process.stdout.write(JSON.stringify(c.__s));"""], cwd=ROOT))
OPP = ["opportunityId", "accountId", "accountName", "amOwner", "opportunityType", "service", "signalDate", "qnbWindow", "lane", "sourceReport", "sourceRecordId", "priorityRank", "eligibilityStatus", "suppressionReason", "campaignId", "detectedAt", "updatedAt"]
ACCOUNTS = [("QA Transportes Andinos", "Colombia"), ("QA Logistica Pacifico", "Peru"), ("QA Cargo Brasil", "Brazil"), ("QA Freight Texas", "United States"), ("QA Distribuidora Sur", "Chile"), ("QA Agro Export", "Peru")]
CONTACTS = [("QA Transportes Andinos", "ana@andinos.example.test", {}), ("QA Transportes Andinos", "compras@andinos.example.test", {"doNotContact": "TRUE"}),
            ("QA Logistica Pacifico", "luis@pacifico.example.test", {}), ("QA Logistica Pacifico", "correo-invalido", {}),
            ("QA Cargo Brasil", "joao@cargobr.example.test", {}), ("QA Freight Texas", "mike@freighttx.example.test", {}),
            ("QA Distribuidora Sur", "pedro@dsur.example.test", {}), ("QA Distribuidora Sur", "ops@dsur.example.test", {"preferredLanguage": "EN"}),
            ("QA Agro Export", "carla@agro.example.test", {})]


def account_id(name):
    out = subprocess.check_output(["node", "-e", "const h=require('crypto').createHash('md5').update(process.argv[1].trim().toLowerCase().replace(/\\s+/g,' ')).digest('hex').slice(0,12).toUpperCase();process.stdout.write('ACC-'+h);", name])
    return out.decode()


def sheet(wb, name, headers, rows):
    ws = wb.create_sheet(name)
    ws.append(headers)
    for r in rows:
        ws.append([r.get(h, "") for h in headers])


os.makedirs(OUT, exist_ok=True)
hub = Workbook(); hub.remove(hub.active)
sheet(hub, "MKT_OPPORTUNITIES", OPP, [])
sheet(hub, "MKT_ACCOUNTS", schema["MKT_ACCOUNTS"], [{"accountId": account_id(n), "accountName": n, "country": c, "externalSystem": "STAGING_SYNTHETIC"} for n, c in ACCOUNTS])
sheet(hub, "MKT_CONTACTS_SECURE", schema["MKT_CONTACTS_SECURE"], [dict({"contactId": "QC%d" % (i + 1), "accountId": account_id(a), "email": e, "status": "ACTIVE", "externalSystem": "STAGING_SYNTHETIC"}, **x) for i, (a, e, x) in enumerate(CONTACTS)])
sheet(hub, "MKT_EMAIL_QUEUE", schema["MKT_EMAIL_QUEUE"] if "MKT_EMAIL_QUEUE" in schema else ["jobId", "campaignId", "email", "status", "processedAt"], [])
hub.save(os.path.join(OUT, "AURA_STAGING_DATA_HUB_SINTETICO.xlsx"))
nova = Workbook(); nova.remove(nova.active)
for tab in ["CUENTAS", "FICHA_CLIENTES", "LQS_SIN_RESPUESTA", "MIGRACION_CAIDAS", "MIGRACION_RECUPERADAS"]:
    nova.create_sheet(tab).append(["Cuenta"])
nova.save(os.path.join(OUT, "AURA_STAGING_NOVA_SOURCE_SINTETICO.xlsx"))
print(os.path.join(OUT, "AURA_STAGING_DATA_HUB_SINTETICO.xlsx"))
print(os.path.join(OUT, "AURA_STAGING_NOVA_SOURCE_SINTETICO.xlsx"))
