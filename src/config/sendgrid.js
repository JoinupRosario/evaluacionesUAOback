import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEmailTemplate, getEmailTextVersion, getLogoUrl } from '../utils/emailTemplates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde la raíz del backend
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Configurar SendGrid con la API key
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

/**
 * Envía un correo de prueba cuando una evaluación cambia a estado "SENT"
 * @param {Object} evaluationData - Datos de la evaluación
 * @param {string} evaluationData.name - Nombre de la evaluación
 * @param {number} evaluationData.period - Período académico
 * @param {Date} evaluationData.start_date - Fecha de inicio
 * @param {Date} evaluationData.finish_date - Fecha de fin
 * @param {number} evaluationData.total_students - Total de estudiantes
 * @param {number} evaluationData.total_bosses - Total de tutores
 * @param {number} evaluationData.total_monitors - Total de monitores
 * @returns {Promise<boolean>} - true si se envió correctamente, false en caso contrario
 */
export const sendEvaluationTestEmail = async (evaluationData) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.error('❌ SENDGRID_API_KEY no está configurada en .env');
      return false;
    }

    const senderEmail = 'practicasypasantias@uao.edu.co';
    const testEmail = 'juan.patino@mozartai.com.co';

    // Formatear fechas
    const formatDate = (date) => {
      if (!date) return 'N/A';
      const d = new Date(date);
      return d.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    };

    const msg = {
      to: testEmail,
      from: senderEmail,
      subject: `Evaluación "${evaluationData.name}" - Estado: SENT`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626;">Evaluación: ${evaluationData.name}</h2>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #374151; margin-top: 0;">Información de la Evaluación</h3>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Nombre:</td>
                <td style="padding: 8px 0; color: #111827;">${evaluationData.name || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Período Académico:</td>
                <td style="padding: 8px 0; color: #111827;">${evaluationData.period || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Fecha de Inicio:</td>
                <td style="padding: 8px 0; color: #111827;">${formatDate(evaluationData.start_date)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Fecha de Fin:</td>
                <td style="padding: 8px 0; color: #111827;">${formatDate(evaluationData.finish_date)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Total Estudiantes:</td>
                <td style="padding: 8px 0; color: #111827;">${evaluationData.total_students || 0}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Total Tutores:</td>
                <td style="padding: 8px 0; color: #111827;">${evaluationData.total_bosses || 0}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Total Monitores:</td>
                <td style="padding: 8px 0; color: #111827;">${evaluationData.total_monitors || 0}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Estado:</td>
                <td style="padding: 8px 0; color: #111827; font-weight: bold; color: #dc2626;">SENT</td>
              </tr>
            </table>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            Este es un correo de prueba. La evaluación ha sido marcada como "SENT" en el sistema.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            Sistema de Evaluaciones - Mozart AI
          </p>
        </div>
      `,
      text: `
Evaluación: ${evaluationData.name}

Información de la Evaluación:
- Nombre: ${evaluationData.name || 'N/A'}
- Período Académico: ${evaluationData.period || 'N/A'}
- Fecha de Inicio: ${formatDate(evaluationData.start_date)}
- Fecha de Fin: ${formatDate(evaluationData.finish_date)}
- Total Estudiantes: ${evaluationData.total_students || 0}
- Total Tutores: ${evaluationData.total_bosses || 0}
- Total Monitores: ${evaluationData.total_monitors || 0}
- Estado: SENT

Este es un correo de prueba. La evaluación ha sido marcada como "ENVIADA" en el sistema.
      `
    };

    await sgMail.send(msg);
    console.log(`✅ Correo de prueba enviado a ${testEmail}`);
    return true;
  } catch (error) {
    console.error('❌ Error al enviar correo de prueba:', error);
    if (error.response) {
      console.error('   Detalles:', error.response.body);
    }
    return false;
  }
};

/**
 * Envía un correo usando las plantillas de prácticas
 * @param {Object} emailData - Datos del correo
 * @param {string} emailData.to - Email del destinatario
 * @param {string} emailData.actorType - Tipo de actor: 'student', 'boss', 'monitor'
 * @param {string} emailData.studentName - Nombre del estudiante
 * @param {string} emailData.tutorName - Nombre del tutor/monitor (solo para boss y monitor)
 * @param {string} emailData.programName - Nombre del programa
 * @param {string} emailData.link - Link de acceso a la evaluación
 * @param {string} emailData.logoUrl - URL del logo (opcional)
 * @returns {Promise<boolean>} - true si se envió correctamente, false en caso contrario
 */
export const sendPracticeEvaluationEmail = async (emailData) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.error('❌ SENDGRID_API_KEY no está configurada en .env');
      return false;
    }

    const { to, actorType, studentName, tutorName, programName, link, logoUrl } = emailData;

    if (!to || !actorType || !studentName || !programName || !link) {
      console.error('❌ Faltan datos requeridos para enviar el correo');
      return false;
    }

    // Validar que tutorName esté presente para boss y monitor
    if ((actorType === 'boss' || actorType === 'monitor') && !tutorName) {
      console.error('❌ tutorName es requerido para boss y monitor');
      return false;
    }

    const senderEmail = 'practicasypasantias@uao.edu.co';
    
    // Obtener la URL del logo (si no se proporciona logoUrl, usar la URL por defecto)
    const finalLogoUrl = logoUrl || getLogoUrl();

    // Preparar variables para la plantilla
    const variables = {
      studentName,
      programName,
      link
    };

    // Agregar tutorName si es necesario
    if (actorType === 'boss' || actorType === 'monitor') {
      variables.tutorName = tutorName;
    }

    // Obtener el HTML y texto de la plantilla
    const html = getEmailTemplate(actorType, variables, finalLogoUrl);
    const text = getEmailTextVersion(actorType, variables);
    
    // Debug: Verificar que el logo se haya insertado
    if (finalLogoUrl) {
      const logoInHtml = html.includes(finalLogoUrl);
      console.log(`📧 Logo URL presente en HTML: ${logoInHtml ? '✅' : '❌'}`);
      if (logoInHtml) {
        console.log(`📧 Logo URL: ${finalLogoUrl}`);
      }
    } else {
      console.warn('⚠️  No se pudo obtener la URL del logo');
    }

    // Determinar el asunto según el tipo de actor
    let subject;
    switch (actorType) {
      case 'student':
        subject = `Evaluación de Práctica - ${studentName}`;
        break;
      case 'boss':
        subject = `Evaluación de Práctica - ${studentName}`;
        break;
      case 'monitor':
        subject = `Evaluación de Práctica - ${studentName}`;
        break;
      default:
        subject = 'Evaluación de Práctica';
    }

    const msg = {
      to,
      from: senderEmail,
      subject,
      html,
      text
    };

    await sgMail.send(msg);
    console.log(`✅ Correo de evaluación enviado a ${to} (${actorType})`);
    return true;
  } catch (error) {
    console.error('❌ Error al enviar correo de evaluación:', error);
    if (error.response) {
      console.error('   Detalles:', error.response.body);
    }
    return false;
  }
};
