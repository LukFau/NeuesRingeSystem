# Nutze ein leichtes Node.js Image
FROM node:18-alpine

# Arbeitsverzeichnis im Container erstellen
WORKDIR /app

# Abhängigkeiten kopieren und installieren
COPY package*.json ./
RUN npm install

# Restlichen Code kopieren
COPY . .

# Führt "vite build" und "esbuild" aus deiner package.json aus
RUN npm run build

# Port definieren (wird von Cloud Run überschrieben, aber gut als Standard)
ENV PORT=8080
EXPOSE 8080

# Das ist der CMD-Befehl, der exakt auf dein Setup passt!
# Er ruft im Hintergrund "node dist/server.cjs" auf.
CMD ["npm", "start"]