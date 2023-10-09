package webapp;


import java.io.IOException;
import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.fasterxml.jackson.core.util.JacksonFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import webapp.data.AreaData;
import webapp.data.Point;
import webapp.data.UserAreaData;
import webapp.errors.InvalidValue;
import webapp.errors.ParamNotFound;
import webapp.errors.ParamValueNotProvided;

// private servlet
// should be inaccessible from outside
@WebServlet(urlPatterns = "/WEB-INF/areaCheck")
public class AreaCheckServlet extends HttpServlet {
  private static final String PARAM_POINT_X = "pointX";
  private static final String PARAM_POINT_Y = "pointY";
  private static final String PARAM_SCALE = "scale";
  private static final String SESSION_POINTS = "points";
  private static final ObjectMapper objectMapper = JsonMapper.builder().findAndAddModules().enable(SerializationFeature.WRAP_ROOT_VALUE).build();

  private static final Set<Double> ALLOWED_SCALE_VALUES = new HashSet<>();
  private static final double SCALE_TOLERANCE = 0.20d;
  private static final Intersector intersector = new Intersector();

  static {
    ALLOWED_SCALE_VALUES.add(1.0d);
    ALLOWED_SCALE_VALUES.add(1.5d);
    ALLOWED_SCALE_VALUES.add(2d);
    ALLOWED_SCALE_VALUES.add(2.5d);
    ALLOWED_SCALE_VALUES.add(3d);

  }

  @Override
  protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
    try {
      processGet(req, resp);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  private void processGet(HttpServletRequest req, HttpServletResponse resp) throws IOException, ParamNotFound, ParamValueNotProvided, InvalidValue {
    final var params = req.getParameterMap();

    final var start = Instant.now();

    final String strPointX = getParamFirstSafe(params, PARAM_POINT_X);
    final String strPointY = getParamFirstSafe(params, PARAM_POINT_Y);
    final String strScale = getParamFirstSafe(params, PARAM_SCALE);
    
    // validate params in numeric form (checks for ranges)
    final double pointX = parseDoubleParam(PARAM_POINT_X, strPointX);
    checkRange(PARAM_POINT_X, -3, pointX, 3);
    final double pointY = parseDoubleParam(PARAM_POINT_Y, strPointY);
    checkRange(PARAM_POINT_Y, -5, pointY, 5);
    final double scaleApproximate = parseDoubleParam(PARAM_SCALE, strScale);
    final double scale = getInSet(PARAM_SCALE, scaleApproximate, ALLOWED_SCALE_VALUES, SCALE_TOLERANCE);
    final double pointXNormalized = normalize(pointX, scale);
    final double pointYNormalized = normalize(pointY, scale);
    // compute intersect
    final var point = new Point(pointXNormalized, pointYNormalized, scale);
    final boolean isIntersects = intersector.intersect(point);

    final var duration = Instant.now().getEpochSecond() - start.getEpochSecond();
    // store results into bean
    final var session = req.getSession(true);
    final var hasPoints = session.getAttribute(SESSION_POINTS) != null;

    if (!hasPoints) {
      final var userAreaData = new UserAreaData();
      userAreaData.setAreaDataList(new LinkedList<>());
      session.setAttribute(SESSION_POINTS, userAreaData);
    }

    final var userData = (UserAreaData) session.getAttribute(SESSION_POINTS);
    final var areaData = new AreaData();
    areaData.setPoint(point);
    areaData.setCalculatedAt(Instant.now());
    areaData.setCalculationTime(duration);
    areaData.setResult(isIntersects);
    userData.getAreaDataList().add(areaData);

    // send bean to client
    objectMapper.writeValue(resp.getWriter(), userData);
  }

  private static String[] getParamSafe(Map<String, String[]> params, String paramName) throws ParamNotFound {
    if (!params.containsKey(paramName)) {
      throw new ParamNotFound(paramName);
    }

    return params.get(paramName);
  }

  private static String getParamFirstSafe(Map<String, String[]> params, String paramName) throws ParamNotFound, ParamValueNotProvided {
    final var values = getParamSafe(params, paramName);
    final var first = getFirst(values);

    if (first.isEmpty()) {
      throw new ParamValueNotProvided(paramName);
    }

    return first.get();
  }

  private static Optional<String> getFirst(String[] values){
    final int FIRST_ELEMENT = 0;
    if (values.length < 1) {
      return Optional.empty();
    }

    return Optional.of(values[FIRST_ELEMENT]);
  }

  private static void validateNumericString(String param, String numericString) throws InvalidValue {
    final int MAX_STRING_LENGTH = 10;
    
    if (numericString.length() < 1) {
      throw new InvalidValue(param, "Empty string provided! Excepted non empty string!");
    }

    if (numericString.length() > MAX_STRING_LENGTH) {
      throw new InvalidValue(param, "Max allowed length is " + MAX_STRING_LENGTH + ". Got: " + numericString.length());
    }
  }

  private static double parseDoubleParam(String paramName, String value) throws InvalidValue {
    try {
      // validate params in string form
      validateNumericString(paramName, value);
      // parse params
      return Double.parseDouble(value);
    } catch (NumberFormatException e) {
      throw new InvalidValue(paramName);
    }
  }

  /**
   * Checks both side inclusive
   * @throws InvalidValue
   */
  private static void checkRange(String paramName, double lower, double value, double upper) throws InvalidValue {
    if (!(lower <= value && value <= upper)) {
      throw new InvalidValue(paramName, "Value not within range: should be higher or equal to " + lower + " and lower or equal to " + upper + ". Got " + value);
    }
  }

  private static double getInSet(String paramName, double value, Set<Double> set, double tolerance) throws InvalidValue {
    tolerance = Math.abs(tolerance);

    for (final double target : set) {
      if (((target - tolerance) <= value && value <= (target + tolerance))) {
        return target;
      }
    } 

    throw new InvalidValue(paramName, "Value " + value + " is not in set!");
  }

  private static double normalize(double num, double scale) {
    assert scale != 0;
    return num / scale;
  }
  
}
