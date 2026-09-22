FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/

RUN nginx -t

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=5 \
  CMD wget --quiet --output-document=- http://127.0.0.1/ >/dev/null || exit 1

EXPOSE 80
