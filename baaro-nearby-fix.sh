#!/usr/bin/env bash
set -euo pipefail

# BAARO — correctif Nearby Chat (Android natif)
# À lancer depuis la racine du dépôt dans GitHub Codespaces.
# Le script refuse de continuer si les extraits attendus ne correspondent pas.

python3 <<'PY'
from pathlib import Path

def edit(path, replacements):
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"Fichier introuvable : {path}")
    text = p.read_text(encoding="utf-8")
    for old, new, label in replacements:
        count = text.count(old)
        if count != 1:
            raise SystemExit(
                f"Arrêt sécurisé : {label} dans {path} — "
                f"occurrences attendues : 1, trouvées : {count}. "
                "Aucun remplacement effectué pour ce bloc."
            )
        text = text.replace(old, new, 1)
    p.write_text(text, encoding="utf-8")
    print(f"OK  {path}")

# 1) Enregistrement du plugin Capacitor Android.
edit("android/app/src/main/java/com/baaro/app/MainActivity.java", [
    (
        "import com.getcapacitor.BridgeActivity;\n",
        "import com.getcapacitor.BridgeActivity;\nimport com.baaro.nearby.NearbyChatPlugin;\n",
        "import du plugin Nearby"
    ),
    (
        "        registerPlugin(BaaroSmsPlugin.class);\n",
        "        registerPlugin(BaaroSmsPlugin.class);\n"
        "        registerPlugin(NearbyChatPlugin.class);\n",
        "enregistrement du plugin Nearby"
    ),
])

# 2) Utiliser l'instance Capacitor enregistrée, et non Capacitor.Plugins
# (l'ancien accès global n'est pas fiable avec Capacitor 8).
edit("src/lib/nearby.js", [
    (
        'import { Capacitor } from "@capacitor/core";\n',
        'import { Capacitor } from "@capacitor/core";\n'
        'import { NearbyChat } from "../../native-plugins/nearby/src/index.ts";\n',
        "import direct NearbyChat"
    ),
    (
           "function getPlugin() {\n"
        "  const plugins = getPlugins();\n"
        "  return plugins.NearbyChat || plugins.NearbyConnections || null;\n"
        "}\n",
        "function getPlugin() {\n"
        "  return NearbyChat || null;\n"
        "}\n",
        "résolution du plugin"
    ),
    (
        "function getPluginName() {\n"
        "  const plugins = getPlugins();\n"
        "  if (plugins.NearbyChat) return \"NearbyChat\";\n"
        "  if (plugins.NearbyConnections) return \"NearbyConnections\";\n"
        "  return null;\n"
        "}\n",
        "function getPluginName() {\n"
        "  return NearbyChat ? \"NearbyChat\" : null;\n"
        "}\n",
        "nom du plugin"
    ),
])

# Conserver le code d'authentification renvoyé par Google Nearby.
edit("src/lib/nearby.js", [
    (
        '    case "CONNECTION_REQUESTED":\n'
        '      return { type, endpointId, deviceName };\n',
        '    case "CONNECTION_REQUESTED":\n'
        '      return { type, endpointId, deviceName, authToken: event.authToken ?? null };\n',
        "conservation du code de vérification"
    ),
])

# 3) Les demandes entrantes doivent être visibles et décidables dans l'UI.
edit("src/hooks/useNearbyChat.js", [
    (
        "  const [devices, setDevices] = useState([]);\n"
        "  const [messages, setMessages] = useState([]);\n",
        "  const [devices, setDevices] = useState([]);\n"
        "  const [pendingRequests, setPendingRequests] = useState([]);\n"
        "  const [messages, setMessages] = useState([]);\n",
        "état des demandes entrantes"
    ),
    (
        "          case \"DEVICE_CONNECTED\": {\n"
        "            if (!endpointId) return;\n",
        "          case \"DEVICE_CONNECTED\": {\n"
        "            if (!endpointId) return;\n"
        "            setPendingRequests((previous) => previous.filter((item) => item.endpointId !== endpointId));\n",
        "nettoyage demande après connexion"
    ),
    (
        "          case \"DEVICE_LOST\": {\n"
        "            if (!endpointId) return;\n",
        "          case \"DEVICE_LOST\": {\n"
        "            if (!endpointId) return;\n"
        "            setPendingRequests((previous) => previous.filter((item) => item.endpointId !== endpointId));\n",
        "nettoyage demande après perte"
    ),
    (
        "          case \"CONNECTION_REQUESTED\":\n"
        "            // La décision d'accepter ou de refuser doit rester explicite.\n"
        "            // L'interface peut utiliser acceptConnection/rejectConnection.\n"
        "            break;\n",
        "          case \"CONNECTION_REQUESTED\": {\n"
        "            if (!endpointId) return;\n"
        "            setPendingRequests((previous) => {\n"
        "              const item = {\n"
        "                endpointId,\n"
        "                name: event.deviceName || \"Appareil à proximité\",\n"
        "                authToken: event.authToken || null,\n"
        "              };\n"
        "              return previous.some((entry) => entry.endpointId === endpointId)\n"
        "                ? previous.map((entry) => entry.endpointId === endpointId ? item : entry)\n"
        "                : [...previous, item];\n"
        "            });\n"
        "            break;\n"
        "          }\n",
        "gestion des demandes entrantes"
    ),
    (
        "      await acceptNearbyConnection(endpointId);\n",
        "      await acceptNearbyConnection(endpointId);\n"
        "      setPendingRequests((previous) => previous.filter((item) => item.endpointId !== endpointId));\n",
        "suppression demande acceptée"
    ),
    (
        "      await rejectNearbyConnection(endpointId);\n",
        "      await rejectNearbyConnection(endpointId);\n"
        "      setPendingRequests((previous) => previous.filter((item) => item.endpointId !== endpointId));\n",
        "suppression demande refusée"
    ),
    (
        "    devices,\n"
        "    messages,\n",
        "    devices,\n"
        "    pendingRequests,\n"
        "    messages,\n",
        "exposition des demandes entrantes"
    ),
])

# 4) Afficher les demandes dans OfflineTab et permettre accepter/refuser.
edit("src/features/offline/OfflineTab.jsx", [
    (
        "    devices,\n"
        "    messages,\n"
        "    error,\n"
        "    start,\n"
        "    stop,\n"
        "    sendMessage,\n",
        "    devices,\n"
        "    pendingRequests,\n"
        "    messages,\n"
        "    error,\n"
        "    start,\n"
        "    stop,\n"
        "    sendMessage,\n"
        "    acceptConnection,\n"
        "    rejectConnection,\n",
        "récupération des demandes et actions"
    ),
    (
        "  const handleToggleScan = async () => {\n"
        "    if (isScanning) {\n"
        "      stop();\n"
        "      showToast(\"Détection P2P arrêtée.\", \"info\");\n",
        "  const handleToggleScan = async () => {\n"
        "    if (isScanning) {\n"
        "      try {\n"
        "        await stop();\n"
        "        showToast(\"Détection P2P arrêtée.\", \"info\");\n"
        "      } catch (err) {\n"
        "        showToast(err.message || \"Impossible d'arrêter Nearby.\", \"error\");\n"
        "      }\n",
        "arrêt asynchrone fiable"
    ),
    (
        "      <div className=\"grid grid-cols-1 md:grid-cols-3 gap-4\">\n",
        "      {pendingRequests.length > 0 && (\n"
        "        <section className=\"rounded-2xl border p-4 space-y-3\" style={{ borderColor: COLORS.gold || COLORS.border, background: COLORS.surface }}>\n"
        "          <h3 className=\"text-sm font-bold\" style={{ color: COLORS.ivory }}>Demandes de connexion</h3>\n"
        "          <p className=\"text-xs\" style={{ color: COLORS.muted }}>Vérifie que le code de sécurité affiché sur les deux téléphones correspond avant d'accepter.</p>\n"
        "          {pendingRequests.map((request) => (\n"
        "            <div key={request.endpointId} className=\"flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3\" style={{ borderColor: COLORS.border }}>\n"
        "              <div className=\"min-w-0\">\n"
        "                <div className=\"text-sm font-semibold\" style={{ color: COLORS.ivory }}>{request.name}</div>\n"
        "                {request.authToken && <div className=\"text-xs mt-1\" style={{ color: COLORS.gold }}>Code de vérification : {request.authToken}</div>}\n"
        "              </div>\n"
        "              <div className=\"flex gap-2\">\n"
        "                <button type=\"button\" onClick={() => acceptConnection(request.endpointId).then(() => showToast(\"Connexion acceptée.\", \"success\")).catch((err) => showToast(err.message, \"error\"))} className=\"rounded-lg px-3 py-2 text-xs font-bold\" style={{ background: COLORS.teal, color: COLORS.bg }}>Accepter</button>\n"
        "                <button type=\"button\" onClick={() => rejectConnection(request.endpointId).then(() => showToast(\"Demande refusée.\", \"info\")).catch((err) => showToast(err.message, \"error\"))} className=\"rounded-lg px-3 py-2 text-xs font-bold border\" style={{ borderColor: COLORS.border, color: COLORS.ivory }}>Refuser</button>\n"
        "              </div>\n"
        "            </div>\n"
        "          ))}\n"
        "        </section>\n"
        "      )}\n"
        "\n"
        "      <div className=\"grid grid-cols-1 md:grid-cols-3 gap-4\">\n",
        "interface des demandes entrantes"
    ),
])

print("\\nCorrectif appliqué. Les fichiers originaux ont été modifiés dans le workspace.")
PY

echo
echo "Étape suivante :"
echo "  npm install"
echo "  npm run build"
echo "  npx cap sync android"
echo
echo "Puis reconstruis et installe l'APK sur DEUX téléphones Android pour tester."
