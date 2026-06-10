// Función de Netlify: recibe el email del formulario y lo da de alta
// en MailerLite. La clave vive en una variable de entorno (MAILERLITE_API_KEY),
// nunca en el código.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método no permitido" };
  }

  let email;
  try {
    email = JSON.parse(event.body || "{}").email;
  } catch {
    return { statusCode: 400, body: "Petición no válida" };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: "Email no válido" };
  }

  try {
    const res = await fetch("https://connect.mailerlite.com/api/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
      },
      body: JSON.stringify({
        email,
        groups: ["189158650754893027"], // grupo "lista de espera masa madre"
      }),
    });

    if (res.ok) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
    return { statusCode: 502, body: "MailerLite ha devuelto un error" };
  } catch {
    return { statusCode: 502, body: "Error de conexión con MailerLite" };
  }
};
