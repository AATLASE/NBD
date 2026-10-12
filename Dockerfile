# Image de production de l'application. Trois étapes : dépendances, construction, exécution.
# L'image finale ne contient que le serveur Next.js autonome (« standalone »), sans node_modules complet.

FROM node:22-bookworm-slim AS dependances
WORKDIR /app
COPY package.json package-lock.json ./
# Sans les scripts d'installation : celui de la CLI Supabase téléchargerait un binaire inutile ici.
RUN npm ci --ignore-scripts

FROM node:22-bookworm-slim AS construction
WORKDIR /app
COPY --from=dependances /app/node_modules ./node_modules
COPY . .
# Les variables NEXT_PUBLIC_* sont écrites dans le code envoyé au navigateur : elles doivent être
# connues ici, à la construction, et pas seulement au démarrage du conteneur.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ]; then \
      echo "NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY doivent être fournies à la construction (variables de build)."; \
      exit 1; \
    fi
RUN npm run build

FROM node:22-bookworm-slim AS execution
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=construction --chown=node:node /app/.next/standalone ./
COPY --from=construction --chown=node:node /app/.next/static ./.next/static
COPY --from=construction --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
