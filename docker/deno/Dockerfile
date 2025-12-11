FROM denoland/deno:debian-2.5.6

RUN apt update && apt install -y unzip curl
RUN deno upgrade

WORKDIR /app