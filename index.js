  const { Client, MessageMedia } = require("whatsapp-web.js");
  const axios = require("axios");
  //const stringSimilarity = require("string-similarity");
  const express = require("express");
  const http = require("http");
  const  socketIo  = require("socket.io");
  const {
    fetchEmailsFromFirestore,
    findEmailInCache,
  } = require("./datos-firebase");

  // Configuración del servidor
  const app = express();
  const server = http.createServer(app);
  const io =  socketIo(server);
  const PORT = process.env.PORT || 4000;

  app.use(express.json());

  const urls = [
    "https://perfil-ldpa.onrender.com",
    "https://api-yape-hzf2.onrender.com",
    "https://api-ia-62m4.onrender.com/",
  ];

  let isChecking = false;

  const checkUrls = async () => {
    if (isChecking) return;  // No ejecutar si ya hay una llamada en curso

    isChecking = true;
    
    for (let url of urls) {
      try {
        const response = await axios.get(url);
        // console.log(`Consulta exitosa a ${url}: Status ${response.status}`);
      } catch (error) {
        console.error(`Error al consultar ${url}: ${error.message}`);
      }
    }

    isChecking = false;
  };

  //setInterval(checkUrls, 300000);  // Cada 5 minutos

  console.log('Node.js version:', process.version);

  // Variables globales
  let preguntasPrevias = {};
  let sesionActiva = false;
  let ultimoQR = null;
  let imageUrl;
  const ultimosMensajes = {};
  let mensajesEnviados = [];

  // Cliente de WhatsApp
  const client = new Client();

  // Emitir QR cuando esté disponible
  client.on("qr", (qr) => {
    ultimoQR = qr;
    sesionActiva = false;
    io.emit("qr", qr); // Emitir el QR al cliente
    console.log(`Código QR generado y enviado.`);
  });

  // Emitir evento cuando la sesión esté lista
  client.on("ready", async () => {
    sesionActiva = true;
    ultimoQR = null; // Limpiar el QR ya que la sesión está activa
    io.emit("sesionActiva", true); // Notificar al cliente que la sesión está activa
    console.log("¡Sesión de WhatsApp iniciada correctamente!");
    await fetchEmailsFromFirestore();
  });

  // Manejar desconexión de la sesión
  client.on("disconnected", () => {
    sesionActiva = false;
    console.log("La sesión de WhatsApp se ha desconectado.");
  });

  let userMessages = {};
  let timers = {};
  const waitForUserInput = (sender, message) => {
    if (timers[sender]) {
      clearTimeout(timers[sender]); // Reinicia el temporizador si ya existe
    }

    timers[sender] = setTimeout(async () => {
      const combinedMessage = userMessages[sender].join(" "); // Combina los mensajes del usuario
      //if (!esPreguntaSimilar(sender, combinedMessage)) {
        //console.log(combinedMessage)
        registrarPregunta(sender, combinedMessage); // Registra la pregunta en tu base de datos
        const respuesta = await consultarApi(sender, combinedMessage); // Consulta la API
        message.reply(respuesta); // Envía la respuesta al usuario
        //console.log("La respuesta es:", respuesta);
      //} else {
      //  //message.reply("Ya me has preguntado eso antes.");
      //  console.log("Ya me has preguntado eso antes.");
      //}

      // Limpia los mensajes y temporizadores después de enviar la respuesta
      delete userMessages[sender];
      delete timers[sender];
    }, 30000); // Espera 1 minuto (60,000 milisegundos)
  };

  // Procesar mensajes entrantes
  client.on("message", async (message) => {
    try {
      const sender = message.from;
      const chat = await message.getChat();
      const esGrupo = sender.includes("@g.us");
      const esChatPrivado = sender.includes("@c.us");
      const userNumber1 = message.from.includes("@")
        ? message.from.split("@")[0]
        : message.from;

      const userNumber = message.from;
      const ahora = Date.now();

      const mensajeActual = message.body;

      if (ultimosMensajes[userNumber1]) {
        const { mensajeAnterior, fechaHoraAnterior } =
          ultimosMensajes[userNumber1];

        // Calcula la diferencia en horas entre el mensaje anterior y el actual
        const diferenciaHoras =
          (ahora - new Date(fechaHoraAnterior)) / (1000 * 60 * 60);

        // Si el mensaje es el mismo y ha pasado menos de 1 hora, no respondas
        if (mensajeAnterior === mensajeActual && diferenciaHoras < 1) {
          console.log(
            `El usuario ${userNumber1} ya envió el mismo mensaje recientemente.`
          );
          return;
        }
      }
      ultimosMensajes[userNumber1] = {
        mensajeAnterior: mensajeActual,
        fechaHoraAnterior: ahora,
      };
      if (esGrupo) {
      } else {
        console.log("Mensaje privado de whatsapp")
        if (esChatPrivado) {
          let isWaitingForEmailAndPhone = false;
          let currentUser = null;
          if (
            message.body.includes("cambiar num") &&
            !isWaitingForEmailAndPhone
          ) {
            // Responder al comando y pedir correo y número
            client.sendMessage(
              msg.from,
              "¡Hola! Por favor, envíame tu correo y nuevo número de teléfono en el siguiente formato:\n\nemail: tu_email@gmail.com\ntel: tu_nuevo_numero"
            );
            isWaitingForEmailAndPhone = true; // Iniciar la espera
            currentUser = msg.from; // Guardar el usuario actual
            console.log(
              `Esperando respuesta de ${msg.from} con su correo y número.`
            );
            return;
          }

          if (isWaitingForEmailAndPhone && msg.from === currentUser) {
            // Procesar el mensaje para extraer el correo y número
            const lines = msg.body.split("\n").map((line) => line.trim());
            const emailLine = lines.find((line) =>
              line.toLowerCase().startsWith("email:")
            );
            const phoneLine = lines.find((line) =>
              line.toLowerCase().startsWith("tel:")
            );

            if (emailLine && phoneLine) {
              const email = emailLine.split(":")[1].trim();
              const phone = phoneLine.split(":")[1].trim();

              // Verificar si el correo existe en Firestore
              const emailExists = await findEmailInCache(email);

              if (emailExists) {
                // Llamar a la función para actualizar el número de teléfono
                const responseMessage = await updatePhoneNumber(email, phone);

                // Responder al usuario con el resultado
                client.sendMessage(msg.from, responseMessage);
              } else {
                client.sendMessage(
                  msg.from,
                  "Lo siento, no pude encontrar ese correo en nuestros registros. ¿Podrías verificarlo?"
                );
              }
            } else {
              // Responder si el formato no es correcto
              client.sendMessage(
                msg.from,
                "Por favor, asegúrate de enviar tu correo y número en el formato correcto:\n\nemail: tu_email@gmail.com\ntel: tu_nuevo_numero"
              );
            }

            // Resetear la espera
            isWaitingForEmailAndPhone = false;
            currentUser = null;
          }

          const planRegex = /Plan\s+.*? - (Yape Fake|BCP Fake|CodexData)/i;
          if (planRegex.test(message.body)) {
            if (!message.body.includes("Mi correo:")) return;

            const lines = message.body.split("\n");
            const nameLine = lines.find((line) =>
              line.startsWith("Mi nombre es:")
            );
            const planLine = lines.find((line) => line.startsWith("El Plan:"));
            const emailLine = lines.find((line) => line.startsWith("Mi correo:"));
            const email = emailLine ? emailLine.split(": ")[1].trim() : null;
            if (!email) {
              await message.reply(
                "No se detectó un correo válido en tu mensaje."
              );
              return;
            }
            console.log(`Verificando el correo: ${email}`);
            const exists = findEmailInCache(email);

            if (exists) {
              const name = nameLine ? nameLine.split(": ")[1] : "Usuario";
              const plan = planLine
                ? planLine.split(":").slice(1).join(":").trim()
                : "Plan Basico";
              console.log(lines);
              console.log(planLine);
              console.log(name);
              console.log(plan);
              const fechaHora = new Date().toLocaleString();
              mensajesEnviados.push({
                name,
                userNumber1,
                fechaHora,
              });

              try {
                // Suponiendo que imageUrl es la URL de la imagen que deseas enviar

                const customMessage = `
Hola ${name}, ¡gracias por elegir el *${plan}*!
  `;

                const pasos = `
**Pasos a seguir:**
1. *Realiza el pago:* Escanea el QR que te hemos enviado y efectúa el pago correspondiente a tu plan y *en la descripcion agrega tu correo.*
2. *Confirma el pago:* Una vez que hayas realizado el pago, por favor envíame una captura de pantalla del comprobante para activar tu suscripción.
3. *Disfruta del servicio:* Una vez confirmado el pago, tendrás acceso inmediato a las funcionalidades del ${plan} y podrás disfrutar de todos sus beneficios.
    
Si tienes alguna duda o necesitas asistencia, no dudes en comunicarte conmigo. Estamos aquí para ayudarte a sacar el máximo provecho de tu plan.
    
_¡Gracias por confiar en nosotros!_`;

                await chat.sendMessage(customMessage);
                //await new Promise(resolve => setTimeout(resolve, 3000));
                if (imageUrl) {
                  const response = await axios.get(imageUrl, {
                    responseType: "arraybuffer",
                  });
                  const imageBase64 = Buffer.from(
                    response.data,
                    "binary"
                  ).toString("base64");
                  const media = new MessageMedia("image/jpeg", imageBase64);

                  await chat.sendMessage(media);
                  setTimeout(async () => {
                    await chat.sendMessage(pasos);
                  }, 3000);
                } else {
                  console.log("no hay nada en img", imageUrl);
                }
              } catch (error) {
                console.error("Error al enviar la imagen:", error);
              }
            } else {
              const responseMessage =
                "Por favor, envíanos un audio para más información.";
              await message.reply(responseMessage);
            }
          } 
          //else if (esPreguntaSimilar(sender, message.body)) {
          //  message.reply("Ya me has preguntado eso antes.");
          //} 
          else {
            if (!userMessages[sender]) {
              userMessages[sender] = [];
            }
            userMessages[sender].push(message.body);
            waitForUserInput(sender, message);
            console.log("Se envio el mensaje a la IA");
            //registrarPregunta(sender, message.body);
            //const respuesta = await consultarApi(sender, message.body);
            //message.reply(respuesta);
          }
        }
      }
    } catch (error) {
      console.error("Error al procesar el mensaje:", error);
    }
  });

  // Verificar si la pregunta es similar a una anterior
  //const esPreguntaSimilar = (usuario, pregunta) => {
  //  const preguntaNormalizada = pregunta.toLowerCase().trim();
  //  if (preguntasPrevias[usuario]) {
  //    const coincidencias = stringSimilarity.findBestMatch(
  //      preguntaNormalizada,
  //      preguntasPrevias[usuario]
  //    );
  //    return coincidencias.bestMatch.rating > 0.8;
  //  }
  //  return false;
  //};

  // Registrar preguntas
  const registrarPregunta = (usuario, pregunta) => {
    const preguntaNormalizada = pregunta.toLowerCase().trim();
    if (!preguntasPrevias[usuario]) {
      preguntasPrevias[usuario] = [];
    }
    preguntasPrevias[usuario].push(preguntaNormalizada);
  };

  // Consultar API externa
  const consultarApi = async (usuario, pregunta) => {
    try {
      const response = await axios.post(
        "https://api-ia-62m4.onrender.com/consultar",
        {
          usuario,
          pregunta,
        }
      );
      //console.log("Respues desde la api:", response.data.respuesta)
      return response.data.respuesta;
    } catch (error) {
      console.error("Error al consultar la API:", error.message);
      return "Lo siento, hubo un error al procesar tu consulta.";
    }
  };

  // Inicializar el cliente de WhatsApp
  client.initialize();

  // Configurar Express para servir el HTML
  app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
  });

  app.post("/verificar", async (req, res) => {
    const { codigo, numero, nombre } = req.body;

    try {
      if (sesionActiva) {
        if (!codigo || !numero) {
          return res.status(400).send("Faltan parámetros: código o número.");
        }

        const mensaje = `Hola ${nombre}, tu código es *${codigo}*`;
        const mensaje2 = `Recuerda que la aplicación es *GRATIS*. No pagues a nadie. Si alguien intenta venderte la aplicación, no lo reclamarle; simplemente repórtalo escribiendo la palabra *reporte*.`;
        const mensaje3 = `El link de la aplicacion: https://perfil-ldpa.onrender.com`;
        const chatId = `51${numero}@c.us`;

        // Enviar el mensaje usando whatsapp-web.js

        client
          .sendMessage(chatId, mensaje)
          .then((response) => {
            client.sendMessage(chatId, mensaje2);
            client.sendMessage(chatId, mensaje3);

            console.log("Mensaje enviado correctamente:");
            return res.status(200).send("Mensaje enviado.");
          })
          .catch((error) => {
            console.error("Error al enviar el mensaje:", error);
            return res.status(500).send("Error al enviar el mensaje.");
          });
      }
    } catch (error) {
      console.error("Error en el servidor:", error);
      res.status(500).send("Error interno del servidor.");
    }
  });

  // Manejar conexiones WebSocket
  io.on("connection", (socket) => {
    console.log("Cliente conectado al servidor.");

    // Enviar QR si la sesión no está activa
    if (!sesionActiva && ultimoQR) {
      socket.emit("qr", ultimoQR);
      console.log("QR enviado al cliente.");
    }

    // Notificar al cliente si la sesión ya está activa
    if (sesionActiva) {
      socket.emit("sesionActiva", true);
      socket.emit("imageUrl", imageUrl);
      console.log("Notificado al cliente: Sesión activa.");
    }

    socket.on("setImageUrl", (url) => {
      imageUrl = url; // Establecer la URL de la imagen
      socket.emit("imageUrl", imageUrl);
      console.log(`URL de la imagen establecida: ${imageUrl}`);
    });
  });

  // Iniciar el servidor
  server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
