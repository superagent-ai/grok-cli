<div align="center">

# 🤖 Grok CLI

### Agent AI conversationnel intelligent pour votre terminal

[![npm version](https://img.shields.io/npm/v/@vibe-kit/grok-cli.svg?style=flat-square)](https://www.npmjs.com/package/@vibe-kit/grok-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen?style=flat-square)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![npm downloads](https://img.shields.io/npm/dm/@vibe-kit/grok-cli.svg?style=flat-square)](https://www.npmjs.com/package/@vibe-kit/grok-cli)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/vibe-kit/grok-cli/typecheck.yml?style=flat-square)](https://github.com/vibe-kit/grok-cli/actions)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

**Un outil CLI puissant propulsé par Grok qui transforme votre terminal en assistant de développement intelligent avec capacités d'édition, recherche avancée et exécution de commandes.**

[Installation](#-installation) •
[Fonctionnalités](#-fonctionnalités-principales) •
[Utilisation](#-utilisation) •
[Documentation](#-documentation) •
[Contribution](#-contribution)

</div>

---

## 📸 Aperçu

<div align="center">

![Grok CLI Demo](https://github.com/user-attachments/assets/192402e3-30a8-47df-9fc8-a084c5696e78)

*Interface interactive avec streaming en temps réel, comptage de tokens et confirmation visuelle*

</div>

---

## ✨ Fonctionnalités Principales

### 🎯 Agent AI Conversationnel
- **Boucle Agentic Intelligente** : Jusqu'à 30 rounds d'utilisation d'outils pour résoudre des tâches complexes
- **Streaming en Temps Réel** : Génération progressive des réponses pour un feedback instantané
- **Multi-Modèles** : Support de Grok-4, Grok-3, Gemini, Claude et plus via configuration d'endpoint personnalisée
- **Comptage de Tokens Précis** : Suivi en temps réel avec tiktoken pour maîtriser vos coûts

### 🛠️ 7 Outils Puissants

| Outil | Description | Fonctionnalités |
|-------|-------------|-----------------|
| 📄 **view_file** | Visualisation de fichiers et répertoires | Plages de lignes, auto-limitation à 10 lignes |
| ➕ **create_file** | Création de fichiers | Création automatique de répertoires parents |
| ✏️ **str_replace_editor** | Édition intelligente de texte | Fuzzy matching, diffs visuels, replace_all |
| 💻 **bash** | Exécution de commandes shell | Support cd persistent, timeout configurable |
| 🔍 **search** | Recherche ultra-rapide | Backend ripgrep, glob patterns, regex, scoring fuzzy |
| ✅ **create_todo_list** | Création de listes de tâches | États, priorités, affichage coloré |
| 🔄 **update_todo_list** | Mise à jour des todos | Modification dynamique status/contenu/priorité |

### 🎨 Interface Utilisateur Moderne
- **Terminal Réactif** : Interface Ink/React avec rendu markdown et coloration syntaxique
- **Confirmations Visuelles** : Preview des diffs avant application avec intégration VS Code
- **Timer de Traitement** : Suivi en temps réel de la durée des opérations
- **Mode Auto-Edit** : Toggle rapide avec Shift+Tab

### 🔐 Sécurité & Fiabilité
- **Système de Confirmation** : Approbation requise avant toute opération destructive
- **Session Flags** : "Don't ask again this session" pour une meilleure UX
- **Scan de Sécurité** : Workflows automatisés avec npm audit et TruffleHog
- **Gestion d'Erreurs Robuste** : Retry logic et feedback détaillé

### 🚀 Fonctionnalités Avancées (Novembre 2025)

#### ⚡ YOLO Mode
Mode d'exécution automatique avec guardrails de sécurité intégrés :
```bash
/yolo on       # Mode complet (50 edits, 100 commandes max)
/yolo safe     # Mode sécurisé avec restrictions
/yolo off      # Désactiver
```

#### 🔄 Pipelines d'Agents
Workflows automatisés pour tâches complexes :
```bash
/pipeline code-review src/     # Revue de code complète
/pipeline bug-fix              # Workflow de correction de bugs
/pipeline security-audit       # Audit de sécurité
/pipeline documentation        # Génération de documentation
```

#### 🎯 Système de Skills
Activation de compétences spécialisées :
```bash
/skill typescript-expert    # Expert TypeScript
/skill react-specialist     # Spécialiste React
/skill security-auditor     # Auditeur sécurité
/skill database-expert      # Expert bases de données
```

#### 💰 Suivi des Coûts
Dashboard de suivi des coûts API en temps réel :
```bash
/cost                    # Afficher le dashboard
/cost budget 10          # Définir budget session ($10)
/cost daily 50           # Limite quotidienne ($50)
```

#### 🌳 Branches de Conversation
Fork et merge de conversations comme avec Git :
```bash
/fork experiment         # Créer une branche
/branches                # Lister les branches
/checkout <id>           # Changer de branche
/merge <id>              # Fusionner une branche
```

#### 🧠 Mémoire Persistante
Stockage de contexte entre sessions :
```bash
/remember api-key sk-xxx     # Stocker une info
/memory recall api-key       # Récupérer
/memory list                 # Lister tout
```

#### 🔀 Exécution Parallèle
Subagents parallèles pour tâches intensives :
```bash
/parallel analyze all TypeScript files in src/
```

#### 🧪 Génération de Tests
Génération automatique de tests :
```bash
/generate-tests src/utils/helpers.ts
```

#### 📝 Détection de Commentaires AI
Scan et résolution de commentaires `// AI: fix this` :
```bash
/scan-todos              # Scanner le projet
/address-todo 1          # Résoudre le TODO #1
```

### ⚡ Modes d'Utilisation

#### Mode Interactif
Interface conversationnelle complète avec toutes les fonctionnalités

#### Mode Headless
Parfait pour CI/CD, scripting et automation
```bash
grok --prompt "analyze package.json and suggest optimizations"
```

### 🎛️ Personnalisation Avancée
- **Instructions Personnalisées** : Fichier `.grok/GROK.md` pour adapter le comportement par projet
- **Configuration Multi-Niveaux** : User settings + project settings
- **Git Automation** : Commande spéciale `grok git commit-and-push` avec messages AI-générés

### 📋 Commandes Slash Disponibles

| Commande | Description |
|----------|-------------|
| `/help` | Afficher l'aide |
| `/clear` | Effacer la conversation |
| `/model` | Changer de modèle AI |
| `/yolo` | Mode auto-exécution |
| `/pipeline` | Exécuter un workflow |
| `/skill` | Gérer les compétences |
| `/cost` | Dashboard des coûts |
| `/fork` | Créer une branche de conversation |
| `/branches` | Lister les branches |
| `/checkout` | Changer de branche |
| `/merge` | Fusionner une branche |
| `/memory` | Gérer la mémoire persistante |
| `/remember` | Stocker une information |
| `/workspace` | Détecter la configuration du projet |
| `/parallel` | Exécuter en parallèle |
| `/generate-tests` | Générer des tests |
| `/scan-todos` | Scanner les commentaires AI |
| `/address-todo` | Résoudre un TODO |
| `/autonomy` | Configurer le niveau d'autonomie |
| `/security` | Gérer les modes de sécurité |
| `/init` | Initialiser un projet Grok |

---

## 🚀 Installation

### Prérequis

- **Node.js** 16.0.0 ou supérieur
- **ripgrep** (optionnel, recommandé pour performances de recherche optimales)
  ```bash
  # macOS
  brew install ripgrep

  # Ubuntu/Debian
  sudo apt-get install ripgrep

  # Windows
  choco install ripgrep
  ```

### Installation Globale (Recommandée)

```bash
npm install -g @vibe-kit/grok-cli
```

### Installation pour Développement

```bash
git clone https://github.com/your-org/grok-cli.git
cd grok-cli
npm install
npm run build
npm link
```

---

## ⚙️ Configuration

### 1. Obtenir une Clé API

Récupérez votre clé API Grok sur [X.AI](https://x.ai)

### 2. Configuration de la Clé API (4 méthodes)

#### Méthode 1 : Variable d'Environnement (Recommandée)
```bash
export GROK_API_KEY=your_api_key_here
```

#### Méthode 2 : Fichier .env
```bash
cp .env.example .env
# Éditez .env et ajoutez votre clé API
```

#### Méthode 3 : Flag en Ligne de Commande
```bash
grok --api-key your_api_key_here
```

#### Méthode 4 : Fichier de Settings Utilisateur
Créez `~/.grok/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here",
  "baseURL": "https://api.x.ai/v1",
  "defaultModel": "grok-4-latest"
}
```

### 3. Base URL Personnalisée (Optionnel)

Pour utiliser d'autres modèles AI (Gemini, Claude, etc.) :

```bash
# Variable d'environnement
export GROK_BASE_URL=https://your-custom-endpoint.com/v1

# Ligne de commande
grok --base-url https://your-custom-endpoint.com/v1

# User settings
{
  "apiKey": "your_api_key",
  "baseURL": "https://your-custom-endpoint.com/v1"
}
```

---

## 💻 Utilisation

### Mode Interactif

```bash
# Lancer dans le répertoire courant
grok

# Spécifier un répertoire de travail
grok -d /path/to/project

# Avec un modèle spécifique
grok --model grok-4-latest
```

### Mode Headless

Parfait pour automation, CI/CD et scripting :

```bash
# Prompt simple
grok --prompt "show me the package.json file"

# Avec répertoire spécifique
grok -p "run tests and show results" -d /path/to/project

# Avec modèle personnalisé
grok -p "refactor auth.ts for better performance" --model grok-4-latest
```

**Cas d'usage headless :**
- ✅ Pipelines CI/CD
- ✅ Scripts shell automatisés
- ✅ Benchmarks terminal (Terminal Bench)
- ✅ Batch processing

### Sélection de Modèle

```bash
# Modèles Grok
grok --model grok-4-latest      # Le plus récent et puissant
grok --model grok-3-latest      # Version stable
grok --model grok-3-fast        # Optimisé pour la vitesse

# Autres modèles (avec endpoint approprié)
grok --model gemini-2.5-pro --base-url https://api-endpoint.com/v1
grok --model claude-sonnet-4-20250514 --base-url https://api-endpoint.com/v1
```

### Options en Ligne de Commande

```bash
grok [options]

Options:
  -V, --version          Afficher le numéro de version
  -d, --directory <dir>  Définir le répertoire de travail
  -k, --api-key <key>    Clé API Grok (ou variable GROK_API_KEY)
  -u, --base-url <url>   URL de base API Grok (ou variable GROK_BASE_URL)
  -m, --model <model>    Modèle AI à utiliser (ex: grok-4-latest)
  -p, --prompt <prompt>  Traiter un prompt unique et quitter (mode headless)
  -h, --help             Afficher l'aide
```

---

## 📚 Exemples Pratiques

### Exploration de Code

```bash
💬 "Montre-moi la structure du projet"
💬 "Trouve tous les fichiers TypeScript dans src/"
💬 "Cherche toutes les fonctions exportées dans utils/"
```

### Édition de Fichiers

```bash
💬 "Crée un composant React Button avec TypeScript"
💬 "Remplace toutes les occurrences de 'oldName' par 'newName' dans src/"
💬 "Ajoute des commentaires JSDoc à toutes les fonctions publiques"
```

### Opérations Git

```bash
💬 "Fais un commit avec un message approprié"
💬 "Montre-moi le git status et suggère les prochaines étapes"

# Commande spéciale
grok git commit-and-push
```

### Refactoring & Code Review

```bash
💬 "Analyse le fichier auth.ts et suggère des améliorations de sécurité"
💬 "Refactorise cette fonction pour utiliser async/await"
💬 "Vérifie s'il y a des dépendances non utilisées dans package.json"
```

### Testing & Build

```bash
💬 "Lance les tests et montre-moi les résultats"
💬 "Build le projet et corrige les erreurs TypeScript"
💬 "Génère des tests unitaires pour la fonction calculateTotal"
```

### Documentation

```bash
💬 "Génère un README pour ce module"
💬 "Ajoute des commentaires explicatifs dans ce fichier"
💬 "Crée une documentation API pour les endpoints"
```

---

## 🎓 Instructions Personnalisées

Adaptez le comportement de Grok à votre projet en créant un fichier `.grok/GROK.md` :

```bash
mkdir -p .grok
```

Exemple `.grok/GROK.md` :
```markdown
# Instructions Personnalisées pour Grok CLI

## Style de Code
- Toujours utiliser TypeScript pour les nouveaux fichiers
- Préférer les composants fonctionnels React avec hooks
- Utiliser const assertions et typage explicite

## Conventions
- Ajouter des commentaires JSDoc pour toutes les fonctions publiques
- Suivre les patterns existants du projet
- Utiliser Prettier pour le formatage

## Tests
- Générer des tests Jest pour chaque nouvelle fonction
- Viser 80%+ de couverture de code

## Git
- Messages de commit en anglais, format conventional commits
- Toujours créer une branche feature avant modifications
```

Grok chargera automatiquement ces instructions et les appliquera à toutes ses actions dans le projet.

---

## 🏗️ Architecture

```
grok-cli/
├── src/
│   ├── agent/              # 🧠 Logique centrale de l'agent AI
│   │   └── grok-agent.ts   # Boucle agentic, streaming, historique
│   │
│   ├── grok/               # 🔌 Client API et outils
│   │   ├── client.ts       # Client OpenAI SDK adapté
│   │   └── tools.ts        # Définitions des 7 outils
│   │
│   ├── tools/              # 🛠️ Implémentations des outils
│   │   ├── bash-tool.ts    # Exécution shell
│   │   ├── file-tool.ts    # Opérations fichiers
│   │   ├── search-tool.ts  # Recherche ripgrep
│   │   └── text-editor.ts  # Édition avec fuzzy matching
│   │
│   ├── ui/                 # 🎨 Interface Ink/React
│   │   ├── components/     # 9 composants réutilisables
│   │   │   ├── chat-interface.tsx
│   │   │   ├── confirmation-dialog.tsx
│   │   │   ├── diff-renderer.tsx
│   │   │   └── ...
│   │   └── utils/          # Utilitaires UI
│   │
│   ├── utils/              # 🔧 Services
│   │   ├── confirmation-service.ts  # Système de confirmations
│   │   ├── settings.ts              # Gestion settings
│   │   ├── custom-instructions.ts   # .grok/GROK.md loader
│   │   └── token-counter.ts         # Comptage tiktoken
│   │
│   ├── types/              # 📝 Définitions TypeScript
│   ├── hooks/              # 🎣 React hooks personnalisés
│   └── index.ts            # 🚪 Point d'entrée CLI
│
├── .github/                # ⚙️ CI/CD
│   └── workflows/
│       ├── security.yml    # Scan sécurité
│       └── typecheck.yml   # Vérification types
│
├── dist/                   # 📦 Code compilé
└── Configuration files
```

### Flux de Données

```
┌─────────────┐
│  CLI Entry │ (Commander.js)
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Chat Interface │ (Ink/React)
└────────┬────────┘
         │
         ▼
┌──────────────────┐
│   Grok Agent     │ (Boucle agentic)
└────────┬─────────┘
         │
         ├──▶ ┌──────────────┐
         │    │ Grok Client  │ (API calls)
         │    └──────────────┘
         │
         ├──▶ ┌──────────────┐
         │    │    Tools     │ (7 outils)
         │    └──────────────┘
         │
         └──▶ ┌──────────────┐
              │ Confirmation │ (User approval)
              └──────────────┘
```

---

## 🧪 Développement

### Scripts Disponibles

```bash
# Installation des dépendances
npm install

# Mode développement avec hot reload
npm run dev

# Build du projet
npm run build

# Linting
npm run lint

# Vérification de types
npm run typecheck

# Lancer en production
npm start
```

### Stack Technique

| Catégorie | Technologies |
|-----------|--------------|
| **Runtime** | Node.js 16+ |
| **Language** | TypeScript 4.9 |
| **UI Framework** | React 17 + Ink 3 |
| **CLI** | Commander.js 11 |
| **API Client** | OpenAI SDK 5.10 |
| **Search** | ripgrep-node |
| **Tokens** | tiktoken |
| **Testing** | _À venir_ |

### Configuration TypeScript

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "jsx": "react",
    "outDir": "./dist",
    "sourceMap": true,
    "declaration": true
  }
}
```

---

## 🔒 Sécurité

### Bonnes Pratiques Implémentées

✅ **Confirmation avant Actions Destructives**
- Toutes les opérations de fichiers et bash nécessitent une approbation
- Preview des diffs avant application
- Session flags pour contrôle fin

✅ **Scan Automatisé de Sécurité**
- GitHub Actions avec npm audit (niveau high)
- TruffleHog pour détection de secrets
- Exécution hebdomadaire + sur chaque PR

✅ **Gestion Sécurisée des Secrets**
- Support variables d'environnement
- Fichiers settings hors version control
- Jamais de hardcoded secrets

✅ **Validation des Entrées**
- Timeout pour commandes bash (30s par défaut)
- Limite de rounds d'outils (30 max)
- Buffer size limité pour bash (1MB)

### Reporting de Vulnérabilités

Pour signaler une vulnérabilité de sécurité, merci de **NE PAS** ouvrir d'issue publique.
Contactez-nous directement à : security@example.com

---

## 📊 Performances

### Métriques Clés

| Métrique | Valeur |
|----------|--------|
| **Recherche de texte** | < 1 seconde (ripgrep) |
| **Streaming** | Temps réel |
| **Timeout API** | 360 secondes |
| **Max rounds outils** | 30 |
| **Buffer bash** | 1MB |
| **Package size** | ~130KB |

### Optimisations

- ⚡ **ripgrep** pour recherche ultra-rapide
- ⚡ **Streaming** pour feedback instantané
- ⚡ **Lazy loading** des composants UI
- ⚡ **Fuzzy matching** optimisé pour édition

---

## 🗺️ Roadmap

### ✅ Version 0.1.0 (Novembre 2025) - COMPLÉTÉ

- [x] **YOLO Mode** - Mode auto-exécution avec guardrails
- [x] **Skills System** - 8 compétences spécialisées prédéfinies
- [x] **Cost Tracking** - Dashboard temps réel des coûts API
- [x] **Conversation Branching** - Fork/merge comme Git
- [x] **Persistent Memory** - Mémoire inter-sessions (GROK_MEMORY.md)
- [x] **Agent Pipelines** - 5 workflows automatisés
- [x] **Parallel Subagents** - Exécution parallèle (max 10)
- [x] **Multi-Model Router** - Routage dynamique par type de tâche
- [x] **Test Generator** - Génération automatique de tests
- [x] **Comment Watcher** - Détection de `// AI: fix this`
- [x] **Workspace Detection** - Auto-configuration projet
- [x] **17 nouvelles commandes slash**

### Version 0.2.0 (Prochain)

- [ ] **Suite de Tests Complète**
  - Tests unitaires (Jest/Vitest)
  - Tests d'intégration
  - Tests UI (testing-library)
  - Objectif : 80%+ coverage

- [ ] **TypeScript Strict Mode**
  - Activation progressive du mode strict
  - Élimination de tous les `any`
  - Types explicites partout

- [ ] **Système de Plugins**
  - Architecture extensible
  - Plugin API publique
  - Registry de plugins

- [ ] **Templates System**
  - Templates de code
  - Project scaffolding
  - Snippets personnalisés

### Version 1.0.0 (Long Terme)

- [ ] **VS Code Extension**
  - Intégration native
  - Sidebar dédiée
  - Keyboard shortcuts

- [ ] **Monitoring & Telemetry**
  - Métriques d'usage (anonymes, opt-in)
  - Error tracking
  - Performance analytics

- [ ] **Multi-Language Support**
  - Interface en plusieurs langues
  - Documentation localisée

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Voici comment participer :

### Workflow de Contribution

1. **Fork** le repository
2. **Créez** une branche feature (`git checkout -b feature/amazing-feature`)
3. **Committez** vos changements (`git commit -m 'Add amazing feature'`)
4. **Pushez** vers la branche (`git push origin feature/amazing-feature`)
5. **Ouvrez** une Pull Request

### Guidelines

- 📝 Suivez le style de code existant (ESLint)
- ✅ Ajoutez des tests pour les nouvelles fonctionnalités
- 📚 Mettez à jour la documentation si nécessaire
- 🔍 Assurez-vous que `npm run lint` et `npm run typecheck` passent
- 💬 Utilisez des messages de commit clairs et descriptifs

### Code de Conduite

Ce projet adhère au [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/0/code_of_conduct/).

---

## 📄 License

Ce projet est sous licence **MIT** - voir le fichier [LICENSE](LICENSE) pour plus de détails.

```
MIT License

Copyright (c) 2025 Grok CLI Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files...
```

---

## 🙏 Remerciements

- **X.AI** pour l'API Grok puissante
- **OpenAI** pour le SDK compatible
- **Vadim Demedes** pour [Ink](https://github.com/vadimdemedes/ink)
- **BurntSushi** pour [ripgrep](https://github.com/BurntSushi/ripgrep)
- Toute la communauté open-source

---

## 📞 Support & Contact

- 🐛 **Bug Reports** : [GitHub Issues](https://github.com/your-org/grok-cli/issues)
- 💡 **Feature Requests** : [GitHub Discussions](https://github.com/your-org/grok-cli/discussions)
- 📧 **Email** : support@example.com
- 💬 **Discord** : [Join our community](#)
- 🐦 **Twitter** : [@grok_cli](#)

---

## 📈 Statistiques du Projet

![GitHub stars](https://img.shields.io/github/stars/your-org/grok-cli?style=social)
![GitHub forks](https://img.shields.io/github/forks/your-org/grok-cli?style=social)
![GitHub watchers](https://img.shields.io/github/watchers/your-org/grok-cli?style=social)

---

<div align="center">

**Fait avec ❤️ par la communauté Grok CLI**

[⬆ Retour en haut](#-grok-cli)

</div>
