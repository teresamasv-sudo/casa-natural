// Función de Netlify: recibe el email del formulario y lo da de alta en Brevo.
// La clave vive en una variable de entorno (BREVO_API_KEY), nunca en el código.
//
// Acepta un campo opcional "source" que decide a qué lista de Brevo va el
// contacto. Así cada lead magnet puede tener su propia automatización.

// Mapa de origen → lista de Brevo.
// Cada formulario manda su "source" y aquí se decide a qué lista va.
const LISTAS = {
  "default": [3],          // lista general (cartas de Casa Natural)
  "menu-semanal": [6],     // lista de La Despensa (menú semanal)
};

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { email, source } = JSON.parse(event.body);

  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email requerido" }) };
  }

  // Solo se aceptan orígenes conocidos; cualquier otra cosa va a la lista general.
  const listIds = LISTAS[source] || LISTAS["default"];

  try {
    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        email: email,
        listIds: listIds,
        updateEnabled: true,
        attributes: source ? { ORIGEN: source } : undefined,
      }),
    });

    if (response.ok || response.status === 204) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      };
    }

    const error = await response.json();
    console.error("Error Brevo:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error al suscribir" }),
    };

  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno" }),
    };
  }
}
