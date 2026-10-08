# EllencoCheck é um site estático (HTML + Supabase). Não há backend próprio.
FROM nginx:1.27-alpine

COPY . /usr/share/nginx/html

# arquivos que não precisam ir para o servidor
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/package.json \
          /usr/share/nginx/html/*.sql \
          /usr/share/nginx/html/*.md

EXPOSE 80
