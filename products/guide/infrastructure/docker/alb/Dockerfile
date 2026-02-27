FROM nginx:alpine

RUN mkdir -p /var/log/nginx /etc/nginx/conf.d

COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/conf.d/default.conf
COPY proxy_params /etc/nginx/proxy_params

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
