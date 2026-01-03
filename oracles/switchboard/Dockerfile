FROM switchboardlabs/sgx-function:main

WORKDIR /app

COPY package.json ./
RUN npm install

COPY src/ ./src/

CMD ["node", "src/index.js"]
