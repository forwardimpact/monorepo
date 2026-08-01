# Gateway container that runs Tinyproxy as the egress proxy
FROM alpine:3.19

RUN apk add --no-cache tinyproxy

COPY tinyproxy.conf /etc/tinyproxy/tinyproxy.conf

EXPOSE 3128

CMD ["tinyproxy", "-d"]
