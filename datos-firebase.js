const { initializeApp } = require("firebase/app");
const { getFirestore, collection, query, where, getDocs } = require("firebase/firestore/lite");

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAImehLPFTGMupcVxuzNNyWkrkkB6utx34",
  authDomain: "apppagos-1ec3f.firebaseapp.com",
  projectId: "apppagos-1ec3f",
  storageBucket: "apppagos-1ec3f.appspot.com",
  messagingSenderId: "296133590526",
  appId: "1:296133590526:web:a47a8e69d5e9bfa26bd4af",
  measurementId: "G-5QZSJN2S1Z",
};

// Inicializar Firebase y Firestore
const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);

// Variable global para almacenar los emails
let emailCache = [];

// Función para obtener emails desde Firestore
const fetchEmailsFromFirestore = async () => {
  try {
    const usuariosRef = collection(db, "usuarios");
    const q = query(usuariosRef, where("plan", "!=", "Sin Plan"));
    const querySnapshot = await getDocs(q);

    const emails = [];
    querySnapshot.forEach(doc => {
      emails.push(doc.data().email);
    });

    emailCache = emails; // Actualiza la variable global
    console.log("Emails actualizados en la caché.");
    return emailCache;
  } catch (error) {
    console.error("Error al obtener los datos de Firestore: ", error);
    return [];
  }
};

// Función para buscar un email en la caché
const findEmailInCache = (email) => {
  return emailCache.includes(email);
};


const updatePhoneNumber = async (email, newPhoneNumber) => {
  try {
    // Referencia a la colección de usuarios
    const usuariosRef = collection(db, "usuarios");
    const q = query(usuariosRef, where("email", "==", email));
    const querySnapshot = await getDocs(q);

    // Si encontramos al usuario
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0]; // Obtener el primer usuario con ese correo
      const userRef = doc(db, "usuarios", userDoc.id);
      
      // Actualizar el número de teléfono
      await updateDoc(userRef, { telefono: newPhoneNumber });
      console.log(`Número de teléfono de ${email} actualizado a ${newPhoneNumber}`);
      
      // Retornar el mensaje de éxito
      return `El número de teléfono de ${email} ha sido actualizado exitosamente a ${newPhoneNumber}.`;
    } else {
      console.log("Usuario no encontrado en Firestore.");
      
      // Retornar el mensaje si el usuario no se encuentra
      return `Lo siento, no encontramos un usuario con ese correo (${email}). Por favor verifica la información.`;
    }
  } catch (error) {
    console.error("Error al actualizar el número de teléfono:", error);
    // Retornar mensaje de error en caso de problemas con la operación
    return "Hubo un error al intentar actualizar el número de teléfono. Por favor, intenta dentro de 1 Hora.";
  }
};


// Exportar funciones
module.exports = {
  fetchEmailsFromFirestore,
  findEmailInCache,
  updatePhoneNumber,
  getCachedEmails: () => emailCache,
};