// Función de Netlify: recibe el email del formulario y lo da de alta
// en MailerLite. La clave vive en una variable de entorno (MAILERLITE_API_KEY),
// nunca en el código.

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { email } = JSON.parse(event.body);

  if (!email) {
    return { statusCode: 400, body: JSON.stringify({ error: "Email requerido" }) };
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        email: email,
        listIds: [3],
        updateEnabled: true,
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