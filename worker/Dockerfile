FROM node:20-slim

WORKDIR /app

# (Enhancement) xray-knife for real protocol testing — currently the worker uses
# a TCP-reachability baseline (src/test.js); installing the binary here lets us
# upgrade test.js to full VLESS/VMess/Trojan validation without changing infra.
# RUN apt-get update && apt-get install -y curl unzip \
#   && curl -L -o /tmp/xk.zip https://github.com/lilendian0x00/xray-knife/releases/latest/download/Xray-knife-linux-64.zip \
#   && unzip /tmp/xk.zip -d /usr/local/bin/ && chmod +x /usr/local/bin/xray-knife \
#   && rm /tmp/xk.zip && apt-get clean

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

CMD ["node", "src/index.js"]
