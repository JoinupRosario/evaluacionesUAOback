-- =============================================================================
-- QUERIES DE PRUEBA: Monitor de práctica - Ana Milena Marin (ammarin@uao.edu.co)
-- Verificar que la usuaria tenga asociadas estudiantes y que las evaluaciones
-- se listen correctamente según la lógica de apl.teacher.
-- Legalizations de ejemplo: Ana Sophia Gutiérrez (14765), Sara Sofía Saavedra (14326).
--
-- NOTA: En muchos entornos el correo del usuario viene en user_name (login), no en
-- personal_email. Por eso se busca al usuario por cualquiera de los tres campos.
-- =============================================================================

-- Correo/login a buscar (puede estar en personal_email, user_name o alternate_user_name)
-- Si en tu BD el correo está en otro campo, ajusta la condición en cada query.

-- 1) Obtener el user.id de la monitora por correo o user_name
--    (en directorio activo suele estar en user_name)
SELECT id AS monitor_user_id, name, last_name,
  user_name,
  personal_email,
  alternate_user_name
FROM user
WHERE personal_email = 'ammarin@uao.edu.co'
   OR user_name = 'ammarin@uao.edu.co'
   OR NULLIF(TRIM(alternate_user_name), '') = 'ammarin@uao.edu.co';

-- 2) Todas las legalizaciones donde esta usuaria es TEACHER (monitor de práctica)
--    Buscamos por user_name o personal_email por si el correo no está en personal_email
SELECT
  apl.academic_practice_legalized_id AS legalization_id,
  CONCAT(u_est.name, ' ', u_est.last_name) AS estudiante_nombre,
  u_est.identification AS estudiante_identificacion,
  u_est.personal_email AS estudiante_email,
  apl.status_apl,
  apl.academic_period_apl AS period_id,
  apl.practice_type,
  apl.program_apl AS program_id
FROM academic_practice_legalized apl
INNER JOIN postulant p ON apl.postulant_apl = p.postulant_id
INNER JOIN user u_est ON p.postulant_id = u_est.id
WHERE apl.teacher = (
    SELECT id FROM user
    WHERE personal_email = 'ammarin@uao.edu.co'
       OR user_name = 'ammarin@uao.edu.co'
       OR NULLIF(TRIM(alternate_user_name), '') = 'ammarin@uao.edu.co'
    LIMIT 1
  )
  AND apl.status_apl NOT IN ('CTP_CANCEL', 'CANCELLED', 'DELETED', 'CTP_REJECTED')
ORDER BY apl.academic_practice_legalized_id;

-- 3) Verificar legalizations 14765 y 14326: mostrar TODOS los posibles campos de correo del monitor
--    (personal_email suele venir vacío si el login/correo está en user_name)
SELECT
  apl.academic_practice_legalized_id AS legalization_id,
  CONCAT(u_est.name, ' ', u_est.last_name) AS estudiante_nombre,
  u_est.identification AS estudiante_identificacion,
  u_mon.name AS monitor_nombre,
  u_mon.last_name AS monitor_apellido,
  u_mon.personal_email AS monitor_personal_email,
  u_mon.user_name AS monitor_user_name,
  u_mon.alternate_user_name AS monitor_alternate_user_name
FROM academic_practice_legalized apl
INNER JOIN postulant p ON apl.postulant_apl = p.postulant_id
INNER JOIN user u_est ON p.postulant_id = u_est.id
LEFT JOIN user u_mon ON apl.teacher = u_mon.id
WHERE apl.academic_practice_legalized_id IN (14765, 14326);

-- 4) Evaluaciones que DEBERÍA ver esta monitora (misma lógica que getEvaluations para rol "Monitor de práctica")
SELECT
  e.evaluation_id,
  e.name,
  e.period,
  e.practice_type,
  e.status,
  e.date_creation
FROM evaluations e
WHERE EXISTS (
  SELECT 1
  FROM evaluation_program ep
  INNER JOIN academic_practice_legalized apl ON apl.program_apl = ep.program_id
  WHERE ep.evaluation_id = e.evaluation_id
    AND e.period = apl.academic_period_apl
    AND (e.practice_type IS NULL OR e.practice_type = apl.practice_type)
    AND apl.teacher = (
      SELECT id FROM user
      WHERE personal_email = 'ammarin@uao.edu.co'
         OR user_name = 'ammarin@uao.edu.co'
         OR NULLIF(TRIM(alternate_user_name), '') = 'ammarin@uao.edu.co'
      LIMIT 1
    )
    AND apl.status_apl NOT IN ('CTP_CANCEL', 'CANCELLED', 'DELETED', 'CTP_REJECTED')
)
ORDER BY e.date_creation DESC;

-- 5) Detalle: para cada evaluación que ve la monitora, cuántas legalizaciones tiene donde ella es teacher
SELECT
  e.evaluation_id,
  e.name AS evaluacion_nombre,
  e.period,
  COUNT(apl.academic_practice_legalized_id) AS num_legalizaciones_con_esta_monitora
FROM evaluations e
INNER JOIN evaluation_program ep ON ep.evaluation_id = e.evaluation_id
INNER JOIN academic_practice_legalized apl
  ON apl.program_apl = ep.program_id
  AND e.period = apl.academic_period_apl
  AND (e.practice_type IS NULL OR e.practice_type = apl.practice_type)
  AND apl.teacher = (
    SELECT id FROM user
    WHERE personal_email = 'ammarin@uao.edu.co'
       OR user_name = 'ammarin@uao.edu.co'
       OR NULLIF(TRIM(alternate_user_name), '') = 'ammarin@uao.edu.co'
    LIMIT 1
  )
  AND apl.status_apl NOT IN ('CTP_CANCEL', 'CANCELLED', 'DELETED', 'CTP_REJECTED')
GROUP BY e.evaluation_id, e.name, e.period
ORDER BY e.date_creation DESC;
