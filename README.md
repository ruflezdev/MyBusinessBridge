# MyBusinessBridge 🚀

**MyBusinessBridge** es un middleware (intermedio) de alto rendimiento desarrollado en **Node.js**. Su función principal es servir como puente de comunicación entre una base de datos **SQL Server (MyBusiness POS)** y aplicaciones móviles **Android**.

Este proyecto resuelve la dificultad de conectar dispositivos móviles directamente a SQL Server, ofreciendo una API REST segura, rápida y fácil de consumir en formato JSON.



## ✨ Características

* **Conexión Automática:** Detecta y carga la configuración desde un archivo `config.json` local.
* **Asistente de Configuración:** Si es la primera vez o la conexión falla, se inicia un asistente interactivo en la terminal.
* **Monitor en Tiempo Real:** Visualiza las IPs de los dispositivos conectados y las acciones que realizan (Logs).
* **Parche de Compatibilidad:** Incluye un polyfill para `AbortSignal.any`, garantizando estabilidad al ser empaquetado como ejecutable.
* **Seguridad:** Implementa parámetros consultados para prevenir ataques de Inyección SQL.

## 🛠️ Stack Tecnológico

* **Lenguaje:** Node.js v22.17.0
* **Framework Web:** Express 5.x
* **Base de Datos:** MSSQL (Driver Tedious)
* **Empaquetado:** PKG (Genera un `.exe` portable)

## 📦 Instalación y Compilación

Si deseas generar tu propio ejecutable:

1.  **Clonar el repositorio:**
    ```bash
    git clone [https://github.com/tu-usuario/MyBusinessBridge.git](https://github.com/tu-usuario/MyBusinessBridge.git)
    cd MyBusinessBridge
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

3.  **Generar el ejecutable (.exe):**
    ```bash
    npm run build
    ```

## 🚀 Uso del Ejecutable

1.  Ejecuta `MyBusinessBridge.exe`.
2.  La primera vez, ingresa los datos de tu servidor SQL:
    * **IP del Servidor:** (Usa `localhost` si la DB está en la misma PC).
    * **Puerto:** Por defecto `53100`.
    * **Credenciales:** Usuario (`sa`) y contraseña.
3.  El programa te mostrará las IPs disponibles (Adaptadores de red). Usa esa IP en tu aplicación Android para conectar.

## 📡 Endpoints de la API

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| **GET** | `/productos` | Retorna la lista de productos (Código, Descripción, Stock, Precio). |
| **DELETE** | `/productos/:id` | Elimina un producto por su código de artículo. |

## 🔧 Notas Técnicas

* **Error AbortSignal:** El código incluye un parche para evitar el error `AbortSignal.any is not a function` común en entornos empaquetados.

---
Desarrollado por **José Rubén Ramos Lomeli** para la modernización de sistemas de inventarios.
