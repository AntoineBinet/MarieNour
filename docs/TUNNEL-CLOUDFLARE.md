# Accéder à MNWork de partout (MARIENOUR.WORK) avec Cloudflare Tunnel

Ce guide décrit comment exposer votre serveur MNWork (qui tourne en local sur le port 3000) sur le domaine **https://marienour.work** grâce à Cloudflare Tunnel. Aucune ouverture de port ni IP publique n’est nécessaire.

## Prérequis

- Un compte Cloudflare avec le domaine **MARIENOUR.WORK** déjà géré (nameservers Cloudflare).
- Windows (ce projet utilise un `.bat` pour lancer le serveur et le tunnel).

## Étapes (à faire une fois)

### 1. Télécharger cloudflared

1. Téléchargez la dernière version de **cloudflared** pour Windows (amd64) depuis :  
   [https://github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases)
2. Récupérez par exemple `cloudflared-windows-amd64.exe` et renommez-le en `cloudflared.exe`.
3. Placez `cloudflared.exe` soit :
   - dans le dossier **`bin`** à la racine du projet MNWork (recommandé),  
   - soit dans un dossier présent dans votre **PATH** (ex. `C:\cloudflared\`).

### 2. Se connecter à Cloudflare

Ouvrez une invite de commandes dans le dossier du projet (ou le dossier où se trouve `cloudflared.exe`) et exécutez :

```bash
cloudflared tunnel login
```

Une page du navigateur s’ouvre pour vous connecter à Cloudflare et autoriser cloudflared pour votre compte. Choisissez le domaine **marienour.work**. À l’issue, un fichier `cert.pem` est créé (souvent dans `%USERPROFILE%\.cloudflared\`). Vous n’avez pas besoin de le déplacer pour la suite.

### 3. Créer un tunnel

Toujours depuis la même invite de commandes :

```bash
cloudflared tunnel create mnwork
```

Notez l’**ID du tunnel** affiché (une longue chaîne hexadécimale). Un fichier de credentials (ex. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json`) est créé dans `%USERPROFILE%\.cloudflared\`.

### 4. Configurer le tunnel

À la racine du projet MNWork, un fichier **`cloudflared-config.yml`** (ou **`cloudflared-config.example.yml`**) sert de modèle. Copiez-le en `cloudflared-config.yml` si besoin, puis éditez-le :

1. **`tunnel`** : remplacez par l’**ID du tunnel** obtenu à l’étape 3.
2. **`credentials-file`** : chemin complet vers le fichier `.json` de credentials (ex. `C:\Users\VotreNom\.cloudflared\xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json`).
3. **`ingress`** : le hostname `marienour.work` (et éventuellement `www.marienour.work`) doit pointer vers `http://localhost:3000`.

Exemple de contenu :

```yaml
tunnel: <VOTRE_TUNNEL_ID>
credentials-file: C:\Users\VotreNom\.cloudflared\<fichier>.json

ingress:
  - hostname: marienour.work
    service: http://localhost:3000
  - hostname: www.marienour.work
    service: http://localhost:3000
  - service: http_status:404
```

La dernière règle `http_status:404` est obligatoire : elle gère toutes les requêtes qui ne correspondent à aucun hostname.

### 5. Créer les enregistrements DNS

Associez le domaine (et optionnellement le sous-domaine www) au tunnel :

```bash
cloudflared tunnel route dns mnwork marienour.work
cloudflared tunnel route dns mnwork www.marienour.work
```

Cela crée les enregistrements CNAME nécessaires dans la zone DNS Cloudflare de **marienour.work**.

### 6. Lancer le tunnel (via le .bat ou à la main)

- **Avec le script** : utilisez **`launch.bat`** à la racine du projet. Il démarre le serveur Node puis, si `cloudflared-config.yml` et `cloudflared.exe` (dans `bin\` ou le PATH) sont présents, le tunnel. Le navigateur s’ouvre sur **https://marienour.work** (ou sur http://127.0.0.1:3000 si le tunnel n’est pas configuré).
- **À la main** : après avoir lancé `node server.js` (ou `npm start`), dans une seconde invite de commandes :

```bash
cloudflared tunnel --config cloudflared-config.yml run mnwork
```

(Remplacez `mnwork` par le **nom** du tunnel si vous en avez utilisé un autre à l’étape 3 ; l’ID dans le fichier de config doit, lui, être l’ID du tunnel.)

## Résumé du flux

1. Vous lancez **launch.bat** sur votre PC.
2. Le serveur MNWork écoute sur **http://127.0.0.1:3000**.
3. **cloudflared** se connecte à Cloudflare et expose ce serveur sur **https://marienour.work**.
4. Depuis n’importe où, vous ouvrez **https://marienour.work**, vous vous connectez (identifiant / mot de passe de l’app), et vous utilisez MNWork comme en local.

## Dépannage

- **« Tunnel non configuré »** : vérifiez que `cloudflared-config.yml` existe à la racine du projet et que les chemins `tunnel` et `credentials-file` sont corrects.
- **Le domaine ne s’ouvre pas** : vérifiez que le tunnel est bien lancé (fenêtre « MNWork - Tunnel »), que le serveur tourne (fenêtre « MNWork - Serveur »), et que les DNS ont bien été ajoutés (`cloudflared tunnel route dns`).
- **Erreur de certificat ou 502** : assurez-vous que le serveur écoute sur le port 3000 avant de lancer le tunnel.
